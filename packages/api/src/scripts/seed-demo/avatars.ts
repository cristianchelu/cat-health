import fs from 'node:fs/promises';
import path from 'node:path';

import type { Kysely } from 'kysely';
import sharp from 'sharp';

import type { Database } from '../../database/index.ts';
import { getMediaPath } from '../../mediaPaths.ts';

const CATAAS_SOURCES: Record<'uti' | 'healthy', string> = {
  uti: 'https://cataas.com/cat/09wFxpacQzvf9jfM?width=800&height=800',
  healthy: 'https://cataas.com/cat/05Xd4JtN14983pns?width=800&height=800',
};

export async function processAvatarImage(fileBuffer: Buffer): Promise<Buffer> {
  const img = sharp(fileBuffer, { failOnError: true });
  const metadata = await img.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error('Invalid avatar image');
  }

  const size = Math.min(metadata.width, metadata.height);
  const top = Math.floor((metadata.height - size) * 0.12);
  const left = Math.floor((metadata.width - size) / 2);
  return img
    .extract({
      left,
      top,
      width: size,
      height: size,
    })
    .resize(256, 256)
    .webp({ quality: 80 })
    .toBuffer();
}

async function fetchCataasPortrait(petKey: 'uti' | 'healthy'): Promise<Buffer> {
  const response = await fetch(CATAAS_SOURCES[petKey]);
  if (!response.ok) {
    throw new Error(`CATAAS fetch failed (${response.status}) for ${petKey}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export async function attachPetAvatar(
  db: Kysely<Database>,
  petId: number,
  sourceBuffer: Buffer,
): Promise<void> {
  const processed = await processAvatarImage(sourceBuffer);
  const mediaRoot = getMediaPath();
  const petDir = path.join(mediaRoot, 'pets', String(petId));
  await fs.mkdir(petDir, { recursive: true });

  const avatarFilename = 'avatar_256.webp';
  const avatarPath = path.join(petDir, avatarFilename);
  await fs.writeFile(avatarPath, processed);

  const relFilePath = path.join('pets', String(petId), avatarFilename);
  const now = Math.floor(Date.now() / 1000);

  const mediaRow = await db
    .insertInto('media')
    .values({
      file_path: relFilePath,
      mime_type: 'image/webp',
      file_size: processed.length,
      description: 'Pet avatar',
      metadata: { width: 256, height: 256, source: 'seed-demo' },
      created_at: now,
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  await db
    .insertInto('media_link')
    .values({
      media_id: mediaRow.id,
      entity_type: 'pet',
      entity_id: String(petId),
      relation: 'avatar',
      created_at: now,
    })
    .execute();
}

export async function seedPetAvatars(
  db: Kysely<Database>,
  petIds: Map<'uti' | 'healthy', number>,
): Promise<number> {
  let count = 0;
  for (const petKey of ['uti', 'healthy'] as const) {
    const petId = petIds.get(petKey);
    if (petId == null) continue;

    try {
      const source = await fetchCataasPortrait(petKey);
      await attachPetAvatar(db, petId, source);
      count += 1;
    } catch (error) {
      console.warn(`Avatar skipped for ${petKey}:`, error);
    }
  }

  return count;
}
