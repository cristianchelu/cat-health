import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { getMediaPath } from '../../../../mediaPaths.ts';
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
import type { PetRecognizerConfig, InferenceAccountConfig } from 'shared';

const RESIZE_SIZE = 256;

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
  ): Promise<{
    pet_id: number | null;
    pet_name: string;
    raw_response: string;
  }> {
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
        return {
          pet_id: null,
          pet_name: 'unknown',
          raw_response: 'Media not found',
        };
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
        return {
          pet_id: null,
          pet_name: 'unknown',
          raw_response: 'No reference images',
        };
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

      // System message
      messages.push({
        role: 'system',
        content:
          'You are a pet identification assistant. Respond with ONLY the pet name from the options provided, or "unknown" if you cannot identify the pet with confidence.',
      });

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

      // Add the target image
      userContent.push({
        type: 'text',
        text: '\n\nWho is the cat in this new image?',
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
      let identifiedPetId: number | null = null;
      let identifiedPetName = 'unknown';

      const responseLower = rawResponse.toLowerCase();
      for (const pet of pets) {
        if (responseLower.includes(pet.name.toLowerCase())) {
          identifiedPetId = pet.id;
          identifiedPetName = pet.name;
          break;
        }
      }

      console.log(
        `AI identified pet as: ${identifiedPetName} (ID: ${identifiedPetId})`,
      );

      this.deps.presence.recordActivity(this.deviceId);

      return {
        pet_id: identifiedPetId,
        pet_name: identifiedPetName,
        raw_response: rawResponse,
      };
    } catch (error) {
      console.error(`Failed to identify pet:`, error);
      throw error;
    }
  }

  async identifyPet(
    eventId: number,
  ): Promise<{
    pet_id: number | null;
    pet_name: string;
    raw_response: string;
  }> {
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
        return { pet_id: null, pet_name: 'unknown', raw_response: 'No media' };
      }

      const snapshotMedia = eventMedia.find((m) => m.relation === 'snapshot');
      const mediaId = snapshotMedia?.id ?? eventMedia[0].id;
      const result = await this.identifyPetFromMedia(mediaId);

      // Update event.pet_id if identified
      if (result.pet_id !== null) {
        await this.deps.db
          .updateTable('event')
          .set({ pet_id: result.pet_id })
          .where('id', '=', eventId)
          .execute();

        console.log(
          `Updated event ${eventId} with pet_id ${result.pet_id} (${result.pet_name})`,
        );
      } else {
        console.log(
          `Could not identify pet in event ${eventId}, AI said: ${result.raw_response}`,
        );
      }

      return result;
    } catch (error) {
      console.error(`Failed to identify pet for event ${eventId}:`, error);
      throw error;
    }
  }
}
