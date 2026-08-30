import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { getMediaPath } from '../../mediaPaths.ts';
import {
  attributionColumns,
  isResolvedCause,
} from '../../domain/eventAttribution.ts';
import type { Kysely } from 'kysely';
import type { Database } from '../../database/index.ts';
import { DEFAULT_RECOGNIZER_MODEL, NON_PET_CAUSES } from 'shared';
import type {
  DeviceRecognitionConfigDTO,
  InferenceAccountConfig,
  EventCauseDTO,
} from 'shared';

const RESIZE_SIZE = 256;

/**
 * The instruction that decides a verdict, kept out of `prompt_template` on
 * purpose: that field is per-device user config, so putting it here is what
 * reaches devices configured before a cause existed.
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

/**
 * The pets this camera is asked about.
 *
 * Two ways to be left out, and they mean different things. The switch being off
 * says this camera never sees that pet — a cat who ignores the hallway fountain,
 * an indoor-only pet on a garden camera. Having no reference photos says we have
 * nothing to show the model, so there is nothing to compare against.
 *
 * Both matter beyond tidiness: every extra name is another way for the model to
 * hedge. On real captures, one cat who never uses the fountain took recognition
 * of the cat who does from 39/39 to 12/39 — not by claiming the wrong cat, but
 * by turning a certain answer into a coin flip the model declined to call.
 */
export function watchedPets<T extends { id: number }>(
  pets: T[],
  config: Pick<DeviceRecognitionConfigDTO, 'reference_images' | 'ignored_pets'>,
): Array<{ pet: T; mediaIds: number[] }> {
  const ignored = new Set(config.ignored_pets ?? []);
  const watched: Array<{ pet: T; mediaIds: number[] }> = [];

  for (const pet of pets) {
    if (ignored.has(pet.id)) continue;
    const mediaIds = config.reference_images[pet.id.toString()] ?? [];
    if (mediaIds.length === 0) continue;
    watched.push({ pet, mediaIds });
  }

  return watched;
}

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
 *
 * `candidates` is the pets the model was offered, not every pet on record — a
 * name outside that set is a name it was never given, so there is nothing to
 * resolve it against and the answer falls through to `unknown`.
 */
export function resolveIdentification(
  rawResponse: string,
  candidates: Array<{ id: number; name: string }>,
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
  for (const pet of candidates) {
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
    .set(attributionColumns(result.caused_by, result.pet_id, 'recognizer'))
    .where('id', '=', eventId)
    .where('caused_by', '=', 'unknown')
    .executeTakeFirst();

  return update.numUpdatedRows === 0n ? 'already_attributed' : 'applied';
}

/**
 * The user text sent with every frame: scene context first, when there is any,
 * then the candidate list.
 *
 * The list is appended here rather than interpolated into the template. An
 * earlier design had the template carry a `{{reference_images}}` placeholder,
 * which made part of the output contract the user's to break — delete the token
 * and the model is never told who it may answer with. The template now supplies
 * scene description and nothing else, and may be empty.
 */
export function buildRecognitionPrompt(
  sceneContext: string,
  candidates: Array<{ petName: string; imageCount: number }>,
): string {
  const candidateList =
    'Pets that may appear here:\n' +
    candidates
      .map(({ petName, imageCount }) => {
        return `${petName}: ${imageCount} reference photo(s)`;
      })
      .join('\n');

  const scene = sceneContext.trim();
  return scene ? `${scene}\n\n${candidateList}` : candidateList;
}

async function resizeImageToBase64(buffer: Buffer): Promise<string> {
  const resized = await sharp(buffer)
    .resize(RESIZE_SIZE, RESIZE_SIZE, { fit: 'cover' })
    .jpeg({ quality: 85 })
    .toBuffer();
  return `data:image/jpeg;base64,${resized.toString('base64')}`;
}

/**
 * Asks the account's inference provider what caused one image.
 *
 * A pure call against config: it reads media and pets, talks to the provider,
 * and returns a verdict. Writing that verdict onto an event is
 * `recordIdentification`'s job, so the same function serves both the automatic
 * path and the Test Recognition diagnostic.
 */
export async function identifyPetFromMedia(
  db: Kysely<Database>,
  config: DeviceRecognitionConfigDTO,
  accountConfig: InferenceAccountConfig,
  mediaId: number,
): Promise<PetIdentificationResult> {
  console.log(`Running pet identification for media ${mediaId}`);

  try {
    // Fetch the target media
    const targetMedia = await db
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

    // 2. Load reference images for the pets this camera watches
    const pets = await db.selectFrom('pet').selectAll().execute();
    const watched = watchedPets(pets, config);

    // Collect all media IDs across those pets in one pass
    const allMediaIds: number[] = [];
    for (const { mediaIds } of watched) {
      allMediaIds.push(...mediaIds);
    }

    // Batch-resolve all media IDs in a single query
    const mediaById = new Map<number, { id: number; file_path: string }>();
    if (allMediaIds.length > 0) {
      const uniqueIds = [...new Set(allMediaIds)];
      const mediaRows = await db
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

    for (const { pet, mediaIds } of watched) {
      const images: string[] = [];
      for (const id of mediaIds) {
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
      console.warn(
        'No pets to compare against: none have reference images, or all of ' +
          'them are switched off',
      );
      return unidentified('No reference images');
    }

    // 3. Build the prompt: the user's scene context, then our candidate list
    const prompt = buildRecognitionPrompt(
      config.prompt_template,
      referenceImages.map(({ pet_name, images }) => ({
        petName: pet_name,
        imageCount: images.length,
      })),
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
    const response = await fetch(`${accountConfig.base_url}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accountConfig.api_key}`,
      },
      body: JSON.stringify({
        model: config.model ?? DEFAULT_RECOGNIZER_MODEL,
        messages,
        max_tokens: 50,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    const rawResponse =
      result.choices[0]?.message?.content?.trim() || 'unknown';

    console.log(`AI response: ${rawResponse}`);

    // 6. Parse response to match pet name
    //
    // Only pets the model was actually shown. Matching against every pet in
    // the database would let an excluded one back in through the answer: the
    // model can name a cat it was never offered — from the scene description,
    // or from a plain wrong guess — and a substring match would then attribute
    // the event to a pet this camera is configured never to see.
    const candidates = referenceImages.map(({ pet_id, pet_name }) => ({
      id: pet_id,
      name: pet_name,
    }));
    const identification = resolveIdentification(rawResponse, candidates);
    console.log(
      `AI verdict: ${identification.caused_by} (${identification.pet_name})`,
    );
    return identification;
  } catch (error) {
    console.error(`Failed to identify pet:`, error);
    throw error;
  }
}
