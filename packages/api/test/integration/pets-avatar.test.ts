import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';

import { PET_AVATAR_MAX_BYTES } from 'shared';

import { getMediaPath } from '../../src/mediaPaths.ts';
import { insertPet } from '../helpers/fixtures.ts';
import {
  createTestApp,
  createTestDb,
  destroyTestDb,
  type TestDbContext,
} from '../helpers/testDb.ts';

describe('pets API avatar_url', () => {
  let ctx: TestDbContext;
  let app: FastifyInstance;
  const cleanupDirs: string[] = [];

  before(async () => {
    ctx = await createTestDb();
    app = await createTestApp(ctx);
  });

  after(async () => {
    await app.close();
    await destroyTestDb(ctx);
    await Promise.all(
      cleanupDirs.map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  it('omits avatar_url when the media row points at a missing file', async () => {
    const pet = await insertPet(ctx.db, { name: 'Orphan Avatar' });
    const now = Math.floor(Date.now() / 1000);
    const missingPath = `pets/__missing_${pet.id}_${now}/avatar_256.webp`;
    const media = await ctx.db
      .insertInto('media')
      .values({
        file_path: missingPath,
        mime_type: 'image/webp',
        file_size: 100,
        description: 'Pet avatar',
        metadata: { width: 256, height: 256 },
        created_at: now,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await ctx.db
      .insertInto('media_link')
      .values({
        media_id: media.id,
        entity_type: 'pet',
        entity_id: String(pet.id),
        relation: 'avatar',
        created_at: now,
      })
      .execute();

    const list = await app.inject({ method: 'GET', url: '/api/pets' });
    assert.equal(list.statusCode, 200);
    const listed = list.json().find((p: { id: number }) => p.id === pet.id);
    assert.equal(listed.avatar_url, undefined);

    const detail = await app.inject({
      method: 'GET',
      url: `/api/pets/${pet.id}`,
    });
    assert.equal(detail.statusCode, 200);
    assert.equal(detail.json().avatar_url, undefined);
  });

  it('returns avatar_url when the file exists on disk', async () => {
    const pet = await insertPet(ctx.db, { name: 'Has Avatar' });
    const relDir = `pets/__present_${pet.id}_${Date.now()}`;
    const relPath = `${relDir}/avatar_256.webp`;
    const petDir = join(getMediaPath(), relDir);
    await mkdir(petDir, { recursive: true });
    cleanupDirs.push(petDir);
    await writeFile(join(petDir, 'avatar_256.webp'), Buffer.from('webp-bytes'));

    const now = Math.floor(Date.now() / 1000);
    const media = await ctx.db
      .insertInto('media')
      .values({
        file_path: relPath,
        mime_type: 'image/webp',
        file_size: 10,
        description: 'Pet avatar',
        metadata: { width: 256, height: 256 },
        created_at: now,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await ctx.db
      .insertInto('media_link')
      .values({
        media_id: media.id,
        entity_type: 'pet',
        entity_id: String(pet.id),
        relation: 'avatar',
        created_at: now,
      })
      .execute();

    const detail = await app.inject({
      method: 'GET',
      url: `/api/pets/${pet.id}`,
    });
    assert.equal(detail.statusCode, 200);
    assert.equal(detail.json().avatar_url, `api/media/${relPath}`);
  });

  /** A one-file multipart body, built by hand because `inject` takes bytes. */
  function avatarUpload(file: Buffer, contentType: string) {
    const boundary = 'avatar-test-boundary';
    const head = Buffer.from(
      `--${boundary}\r\n` +
        'Content-Disposition: form-data; name="avatar"; filename="avatar"\r\n' +
        `Content-Type: ${contentType}\r\n\r\n`,
    );
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
    return {
      payload: Buffer.concat([head, file, tail]),
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    };
  }

  it('stores an uploaded avatar as a 256px webp', async () => {
    const pet = await insertPet(ctx.db, { name: 'Photo Cat' });
    cleanupDirs.push(join(getMediaPath(), 'pets', String(pet.id)));
    const png = await sharp({
      create: { width: 8, height: 4, channels: 3, background: '#808080' },
    })
      .png()
      .toBuffer();

    const res = await app.inject({
      method: 'POST',
      url: `/api/pets/${pet.id}/avatar`,
      ...avatarUpload(png, 'image/png'),
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json().avatar, {
      url: `api/media/pets/${pet.id}/avatar_256.webp`,
      width: 256,
      height: 256,
    });
  });

  it('refuses an avatar over the size limit', async () => {
    const pet = await insertPet(ctx.db, { name: 'Heavy Cat' });
    const res = await app.inject({
      method: 'POST',
      url: `/api/pets/${pet.id}/avatar`,
      ...avatarUpload(Buffer.alloc(PET_AVATAR_MAX_BYTES + 1), 'image/png'),
    });
    assert.equal(res.statusCode, 413);
    assert.equal(res.json().error, 'Payload Too Large');
  });

  it('refuses an avatar of an unsupported type', async () => {
    const pet = await insertPet(ctx.db, { name: 'Gif Cat' });
    const res = await app.inject({
      method: 'POST',
      url: `/api/pets/${pet.id}/avatar`,
      ...avatarUpload(Buffer.from('GIF89a'), 'image/gif'),
    });
    assert.equal(res.statusCode, 415);
    assert.equal(res.json().error, 'Unsupported Media Type');
  });
});
