import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import type { Kysely } from 'kysely';
import type { Database } from '../../database/index.ts';
import type { MediaMetadata } from '../../database/types/MediaTable.ts';

export interface PendingMedia {
  path: string;
  cleanup: () => Promise<void>;
}

export class MediaManager {
  private db: Kysely<Database>;
  private tempDir: string;
  private mediaDir: string;

  constructor(db: Kysely<Database>) {
    this.db = db;
    this.mediaDir =
      process.env.MEDIA_PATH || path.join(process.cwd(), 'data', 'media');
    this.tempDir =
      process.env.MEDIA_TEMP_PATH || path.join(process.cwd(), 'data', 'temp');
  }

  async initialize() {
    await fs.mkdir(this.tempDir, { recursive: true });
    await fs.mkdir(this.mediaDir, { recursive: true });
  }

  async createPendingMedia(extension: string): Promise<PendingMedia> {
    const id = crypto.randomUUID();
    const filename = `${id}.${extension}`;
    const filePath = path.join(this.tempDir, filename);

    return {
      path: filePath,
      cleanup: async () => {
        try {
          await fs.unlink(filePath);
        } catch (err) {
          // Ignore if file doesn't exist
          if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
            console.error(`Failed to cleanup temp file ${filePath}:`, err);
          }
        }
      },
    };
  }

  async persistMedia(
    pendingPath: string,
    metadata: MediaMetadata = {},
    mimeType: string = 'application/octet-stream',
  ) {
    // 1. Generate permanent path (YYYY/MM/DD/uuid.ext)
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const ext = path.extname(pendingPath);
    const uuid = crypto.randomUUID();

    const relativeDir = path.join(year, month, day);
    const fullDir = path.join(this.mediaDir, relativeDir);
    await fs.mkdir(fullDir, { recursive: true });

    const filename = `${uuid}${ext}`;
    const fullPath = path.join(fullDir, filename);

    // Store path relative to the media root, so it's portable if MEDIA_PATH changes location
    const relativePath = path.join(relativeDir, filename);

    // 2. Move file
    await fs.rename(pendingPath, fullPath);
    const stats = await fs.stat(fullPath);

    // 3. Insert into DB
    const result = await this.db
      .insertInto('media')
      .values({
        file_path: relativePath,
        mime_type: mimeType,
        file_size: stats.size,
        metadata: JSON.stringify(metadata) as unknown as MediaMetadata,
        created_at: Math.floor(now.getTime() / 1000),
        description: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return result;
  }

  async linkMediaToEvent(mediaId: number, eventId: number, relation?: string) {
    await this.db
      .insertInto('media_link')
      .values({
        media_id: mediaId,
        entity_type: 'event',
        entity_id: eventId.toString(),
        relation: relation || null,
        created_at: Math.floor(Date.now() / 1000),
      })
      .execute();
  }
}
