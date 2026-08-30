import fs from 'node:fs/promises';
import path from 'node:path';

import type { Kysely } from 'kysely';

import type { Database } from '../../database/index.ts';
import { getMediaPath } from '../../mediaPaths.ts';

export async function hasDomainData(db: Kysely<Database>): Promise<boolean> {
  const [pet, event, device, food] = await Promise.all([
    db.selectFrom('pet').select('id').limit(1).executeTakeFirst(),
    db.selectFrom('event').select('id').limit(1).executeTakeFirst(),
    db.selectFrom('device').select('id').limit(1).executeTakeFirst(),
    db.selectFrom('food').select('id').limit(1).executeTakeFirst(),
  ]);

  return pet != null || event != null || device != null || food != null;
}

export async function wipeDomainData(db: Kysely<Database>): Promise<void> {
  const mediaRoot = getMediaPath();

  await db.deleteFrom('event').execute();
  await db.deleteFrom('device_camera').execute();
  await db.deleteFrom('device_recognition').execute();
  await db.deleteFrom('device').execute();
  await db.deleteFrom('media_link').execute();
  await db.deleteFrom('media').execute();
  await db.deleteFrom('food').execute();
  await db.deleteFrom('pet').execute();

  try {
    await fs.rm(path.join(mediaRoot, 'pets'), { recursive: true, force: true });
  } catch {
    // ignore missing media root
  }
}
