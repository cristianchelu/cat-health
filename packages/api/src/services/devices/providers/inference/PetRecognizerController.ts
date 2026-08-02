import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { getMediaPath } from '../../../../mediaPaths.ts';
import {
  attributionColumns,
  isResolvedCause,
} from '../../../../domain/eventAttribution.ts';
import type { Kysely } from 'kysely';
import type { Database } from '../../../../database/index.ts';
import type { DeviceStatus } from 'shared';
import {
  InferenceAccountConfigSchema,
  PetRecognizerConfigSchema,
  requireWithSchema,
} from 'shared';
import type {
  DeviceController,
  ProviderDeps,
  Device,
  ProviderAccount,
} from '../../types.ts';
import type { DeviceMediaReadyEvent } from '../../EventBus.ts';
import { NON_PET_CAUSES } from 'shared';
import type {
  PetRecognizerConfig,
  InferenceAccountConfig,
  EventCauseDTO,
} from 'shared';

const RESIZE_SIZE = 256;

/**
 * The instruction that decides a verdict, kept out of `prompt_template` on
 * purpose: that field is per-device user config, so putting it here is what
 * reaches recognizers configured before a cause existed.
 *
 * A cause must be *visible*. An earlier wording said "if no pet is in the
 * image, reply with whichever of these caused it", which forced a pick from the
 * list whenever no cat was in frame — and a snapshot fires on the sensor, so the
 * animal has often already left. Measured against real captures, that reliably
 * turned an empty frame containing only the water fountain into `robot_vacuum`:
 * a white cylinder on the floor reads as one. Ordinary drinks would have been
 * attributed to the vacuum and dropped from the pet's intake, which is the exact
 * corruption the cause vocabulary exists to prevent.
 */
export const RECOGNIZER_SYSTEM_MESSAGE =
  'You are a pet identification assistant. Respond with ONLY one word. ' +
  'Reply with the pet name from the options provided if you recognise the animal. ' +
  'If you can clearly SEE what caused this instead of a pet, reply with one of: ' +
  `${NON_PET_CAUSES.join(', ')}. ` +
  'Otherwise reply "unknown" — including when the scene is empty, when it shows ' +
  'only furniture or equipment such as a bowl, fountain or litter tray, or when ' +
  'an animal is present but you cannot say which pet it is. Do not guess.';

/** Punctuation and casing vary between models; compare on a flattened form. */
function normalizeVerdict(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export interface PetIdentificationResult {
  pet_id: number | null;
  caused_by: EventCauseDTO;
  /** The pet's name, or the cause token — display fallback only. */
  pet_name: string;
  raw_response: string;
}

/**
 * Every path where we could not look. `unknown` is the honest answer: failing to
 * see a cat is not evidence that no cat was there.
 */
function unidentified(rawResponse: string): PetIdentificationResult {
  return {
    pet_id: null,
    caused_by: 'unknown',
    pet_name: 'unknown',
    raw_response: rawResponse,
  };
}

/**
 * The model's free-text answer → a verdict.
 *
 * Cause tokens are tested first, and against the whole normalised answer, while
 * the pet match below is a substring test. Order matters: a pet called "Human"
 * or "Roomba" would otherwise match inside a cause token and claim a positive
 * identification. Whole-answer matching is also what keeps "a human is holding
 * the cat" from being read as the `human` cause.
 */
export function resolveIdentification(
  rawResponse: string,
  pets: Array<{ id: number; name: string }>,
): PetIdentificationResult {
  const normalized = normalizeVerdict(rawResponse);
  const cause = NON_PET_CAUSES.find((c) => c === normalized);
  if (cause) {
    return {
      pet_id: null,
      caused_by: cause,
      pet_name: cause,
      raw_response: rawResponse,
    };
  }

  const responseLower = rawResponse.toLowerCase();
  for (const pet of pets) {
    if (responseLower.includes(pet.name.toLowerCase())) {
      return {
        pet_id: pet.id,
        caused_by: 'pet',
        pet_name: pet.name,
        raw_response: rawResponse,
      };
    }
  }

  return unidentified(rawResponse);
}

/**
 * Persist a verdict, but only onto an event nobody has resolved yet.
 *
 * The guard lives in the WHERE clause rather than a preceding SELECT: a
 * read-then-write would race with a decision made while the inference call was
 * in flight, which is a wide window — seconds of network round-trip.
 *
 * Resolved is resolved, whoever resolved it. This deliberately does not consult
 * `human_verified`, which tracks whether a human touched the event at all — a
 * different question from whether its attribution is settled.
 */
export async function recordIdentification(
  db: Kysely<Database>,
  eventId: number,
  result: PetIdentificationResult,
): Promise<'applied' | 'already_attributed' | 'unresolved'> {
  if (!isResolvedCause(result.caused_by)) return 'unresolved';

  const update = await db
    .updateTable('event')
    .set(
      attributionColumns(result.caused_by, result.pet_id, 'recognizer'),
    )
    .where('id', '=', eventId)
    .where('caused_by', '=', 'unknown')
    .executeTakeFirst();

  return update.numUpdatedRows === 0n ? 'already_attributed' : 'applied';
}

async function resizeImageToBase64(buffer: Buffer): Promise<string> {
  const resized = await sharp(buffer)
    .resize(RESIZE_SIZE, RESIZE_SIZE, { fit: 'cover' })
    .jpeg({ quality: 85 })
    .toBuffer();
  return `data:image/jpeg;base64,${resized.toString('base64')}`;
}

export class PetRecognizerController implements DeviceController {
  readonly deviceId: number;
  private config: PetRecognizerConfig;
  private accountConfig: InferenceAccountConfig;
  private status: DeviceStatus = 'unknown';
  private device: Device;
  private deps: ProviderDeps;
  private eventHandler: ((event: DeviceMediaReadyEvent) => void) | null = null;

  constructor(device: Device, account: ProviderAccount, deps: ProviderDeps) {
    this.device = device;
    this.deps = deps;
    this.deviceId = device.id;

    this.config = requireWithSchema(
      PetRecognizerConfigSchema,
      device.config,
      'pet recognizer configuration',
    );
    this.accountConfig = requireWithSchema(
      InferenceAccountConfigSchema,
      account.config,
      'inference account configuration',
    );
  }

  async connect(): Promise<void> {
    // Subscribe only after snapshot media has been linked to the event.
    this.eventHandler = (event: DeviceMediaReadyEvent) => {
      // Filter for events from our source device
      if (
        event.deviceId === this.config.source_device_id &&
        this.config.auto_identify
      ) {
        // Run identification asynchronously (don't block event handler)
        this.identifyPet(event.eventId).catch((error) => {
          console.error(
            `Error auto-identifying pet for event ${event.eventId}:`,
            error,
          );
        });
      }
    };

    this.deps.eventBus.subscribe('device.event.media_ready', this.eventHandler);
    this.status = 'online';
    this.deps.presence.reportOnline(this.deviceId);
    console.log(`Pet recognizer ${this.device.name} connected and listening`);
  }

  async disconnect(): Promise<void> {
    if (this.eventHandler) {
      this.deps.eventBus.removeListener(
        'device.event.media_ready',
        this.eventHandler,
      );
      this.eventHandler = null;
    }
    this.status = 'offline';
    this.deps.presence.reportOffline(this.deviceId);
  }

  getStatus() {
    return this.status;
  }

  async identifyPetFromMedia(
    mediaId: number,
  ): Promise<PetIdentificationResult> {
    console.log(`Running pet identification for media ${mediaId}`);

    try {
      // Fetch the target media
      const targetMedia = await this.deps.db
        .selectFrom('media')
        .select(['id', 'file_path', 'mime_type'])
        .where('id', '=', mediaId)
        .executeTakeFirst();

      if (!targetMedia) {
        console.warn(`Media ${mediaId} not found`);
        return unidentified('Media not found');
      }

      const targetImagePath = path.join(getMediaPath(), targetMedia.file_path);
      const targetImageBuffer = await fs.readFile(targetImagePath);
      const targetImageDataUrl = await resizeImageToBase64(targetImageBuffer);

      // 2. Load reference images for all pets
      const pets = await this.deps.db.selectFrom('pet').selectAll().execute();

      // Collect all media IDs across all pets in one pass
      const allMediaIds: number[] = [];
      const petMediaMap = new Map<number, number[]>();

      for (const pet of pets) {
        const ids = this.config.reference_images[pet.id.toString()] || [];
        if (ids.length > 0) {
          petMediaMap.set(pet.id, ids);
          allMediaIds.push(...ids);
        }
      }

      // Batch-resolve all media IDs in a single query
      const mediaById = new Map<number, { id: number; file_path: string }>();
      if (allMediaIds.length > 0) {
        const uniqueIds = [...new Set(allMediaIds)];
        const mediaRows = await this.deps.db
          .selectFrom('media')
          .select(['id', 'file_path'])
          .where('id', 'in', uniqueIds)
          .execute();
        for (const row of mediaRows) {
          mediaById.set(row.id, row);
        }
      }

      const referenceImages: Array<{
        pet_id: number;
        pet_name: string;
        images: string[];
      }> = [];

      for (const pet of pets) {
        const ids = petMediaMap.get(pet.id);
        if (!ids) continue;

        const images: string[] = [];
        for (const id of ids) {
          const media = mediaById.get(id);
          if (!media) continue;
          try {
            const imagePath = path.join(getMediaPath(), media.file_path);
            const imageBuffer = await fs.readFile(imagePath);
            const imageDataUrl = await resizeImageToBase64(imageBuffer);
            images.push(imageDataUrl);
          } catch (error) {
            console.warn(`Failed to load reference image ${id}:`, error);
          }
        }

        if (images.length > 0) {
          referenceImages.push({
            pet_id: pet.id,
            pet_name: pet.name,
            images,
          });
        }
      }

      if (referenceImages.length === 0) {
        console.warn('No reference images configured for any pet');
        return unidentified('No reference images');
      }

      // 3. Build the prompt with reference images
      const referenceImagesText = referenceImages
        .map(({ pet_name, images }) => {
          return `${pet_name}: ${images.length} reference photo(s)`;
        })
        .join('\n');

      const prompt = this.config.prompt_template.replace(
        '{{reference_images}}',
        referenceImagesText,
      );

      // 4. Build OpenAI-compatible chat completion request
      const messages: Array<{
        role: 'system' | 'user';
        content:
          | string
          | Array<{ type: string; image_url?: { url: string }; text?: string }>;
      }> = [];

      messages.push({ role: 'system', content: RECOGNIZER_SYSTEM_MESSAGE });

      // User message with images
      const userContent: Array<{
        type: string;
        image_url?: { url: string };
        text?: string;
      }> = [];

      // Add prompt text
      userContent.push({
        type: 'text',
        text: prompt,
      });

      // Add reference images for each pet
      for (const { pet_name, images } of referenceImages) {
        userContent.push({
          type: 'text',
          text: `\n\nReference photos of ${pet_name}:`,
        });
        for (const imageUrl of images) {
          userContent.push({
            type: 'image_url',
            image_url: { url: imageUrl },
          });
        }
      }

      // Add the target image.
      // Phrased as a cause, not "who is the cat": the old wording presupposed a
      // cat and measurably pushed the model into naming one even for a person.
      // It stays here rather than in `prompt_template` because it is part of the
      // output contract, which is code's to own — the template supplies scene
      // context, not instructions.
      userContent.push({
        type: 'text',
        text: '\n\nWhat caused this new image?',
      });
      userContent.push({
        type: 'image_url',
        image_url: { url: targetImageDataUrl },
      });

      messages.push({
        role: 'user',
        content: userContent,
      });

      // 5. Call OpenRouter API
      const response = await fetch(
        `${this.accountConfig.base_url}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.accountConfig.api_key}`,
          },
          body: JSON.stringify({
            model: this.config.model,
            messages,
            max_tokens: 50,
            temperature: 0.1,
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `OpenRouter API error: ${response.status} ${errorText}`,
        );
      }

      const result = await response.json();
      const rawResponse =
        result.choices[0]?.message?.content?.trim() || 'unknown';

      console.log(`AI response: ${rawResponse}`);

      // 6. Parse response to match pet name
      this.deps.presence.recordActivity(this.deviceId);

      const identification = resolveIdentification(rawResponse, pets);
      console.log(
        `AI verdict: ${identification.caused_by} (${identification.pet_name})`,
      );
      return identification;
    } catch (error) {
      console.error(`Failed to identify pet:`, error);
      throw error;
    }
  }

  async identifyPet(eventId: number): Promise<PetIdentificationResult> {
    console.log(`Running pet identification for event ${eventId}`);

    try {
      // 1. Fetch event media
      const eventMedia = await this.deps.db
        .selectFrom('media_link')
        .innerJoin('media', 'media.id', 'media_link.media_id')
        .where('media_link.entity_type', '=', 'event')
        .where('media_link.entity_id', '=', eventId.toString())
        .select(['media.id', 'media_link.relation'])
        .orderBy('media.created_at', 'asc')
        .orderBy('media.id', 'asc')
        .execute();

      if (eventMedia.length === 0) {
        console.warn(
          `Invariant violation: device.event.media_ready fired without linked media for event ${eventId}`,
        );
        return unidentified('No media');
      }

      const snapshotMedia = eventMedia.find((m) => m.relation === 'snapshot');
      const mediaId = snapshotMedia?.id ?? eventMedia[0].id;
      const result = await this.identifyPetFromMedia(mediaId);

      const outcome = await recordIdentification(
        this.deps.db,
        eventId,
        result,
      );

      if (outcome === 'unresolved') {
        console.log(
          `Could not identify pet in event ${eventId}, AI said: ${result.raw_response}`,
        );
      } else if (outcome === 'already_attributed') {
        console.log(
          `Left event ${eventId} alone — already attributed; AI said ${result.pet_name}`,
        );
      } else {
        console.log(
          `Attributed event ${eventId} as ${result.caused_by} (${result.pet_name})`,
        );
      }

      return result;
    } catch (error) {
      console.error(`Failed to identify pet for event ${eventId}:`, error);
      throw error;
    }
  }
}
