import { getMediaPath } from '../mediaPaths.ts';
import { sql } from 'kysely';
import path from 'node:path';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import type { MultipartFile } from '@fastify/multipart';
import {
  GetPetParamsSchema,
  GetPetResponseSchema,
  GetPetsResponseSchema,
  PostPetRequestSchema,
  PatchPetRequestSchema,
  TogglePetPresenceParamsSchema,
  TogglePetPresenceResponseSchema,
  type PatchPetRequestDTO,
} from 'shared';
import {
  Type,
  type FastifyPluginAsyncTypebox,
} from '@fastify/type-provider-typebox';
import {
  buildToggledPresenceData,
  deriveIsAway,
  fetchLatestPresenceByPetIds,
  fetchLatestPresenceForPet,
} from '../services/events/petPresence.ts';
import { recordPetPresenceEvent } from '../services/events/recordPetPresenceEvent.ts';

function serializeEventRow(event: {
  id: number;
  parent_event_id: number | null;
  pet_id: number | null;
  device_id: number | null;
  timestamp: Date;
  data: unknown;
  raw_data: Buffer | null;
  human_verified: boolean;
}) {
  return {
    ...event,
    raw_data: event.raw_data ? Array.from(event.raw_data) : null,
  };
}

export const petRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  const { db } = fastify;

  fastify.get(
    '/',
    {
      schema: {
        response: {
          '200': GetPetsResponseSchema,
        },
      },
    },
    async () => {
      const rows = await db
        .selectFrom('pet')
        .leftJoin('media_link', (join) =>
          join
            .on('media_link.entity_type', '=', sql.lit('pet'))
            .on('media_link.relation', '=', sql.lit('avatar'))
            .on(sql`CAST(pet.id AS TEXT) = media_link.entity_id`),
        )
        .leftJoin('media', 'media.id', 'media_link.media_id')
        .select([
          'pet.id as id',
          'pet.name as name',
          'pet.breed as breed',
          'pet.birth_date as birth_date',
          'media.file_path as avatar_file_path',
        ])
        .execute();
      const presenceByPet = await fetchLatestPresenceByPetIds(
        db,
        rows.map((row) => row.id),
      );
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        breed: r.breed,
        // birth_date is stored as text in SQLite, shared schema currently uses Any
        birth_date: r.birth_date,
        avatar_url: r.avatar_file_path
          ? `api/media/${r.avatar_file_path}`
          : undefined,
        is_away: deriveIsAway(presenceByPet.get(r.id)),
      }));
    },
  );

  fastify.post(
    '/',
    {
      schema: {
        body: PostPetRequestSchema,
        response: {
          '200': GetPetResponseSchema,
        },
      },
    },
    async (request) => {
      const { name, breed, birth_date } = request.body;

      const result = await db
        .insertInto('pet')
        .values({ name, breed, birth_date })
        .returningAll()
        .executeTakeFirstOrThrow();
      return { ...result, avatar_url: undefined, is_away: false };
    },
  );
  fastify.get(
    '/:id',
    {
      schema: {
        params: GetPetParamsSchema,
        response: {
          '200': GetPetResponseSchema,
        },
      },
    },
    async (request) => {
      const { id } = request.params as { id: number };
      const row = await db
        .selectFrom('pet')
        .leftJoin('media_link', (join) =>
          join
            .on('media_link.entity_type', '=', sql.lit('pet'))
            .on('media_link.relation', '=', sql.lit('avatar'))
            .on(sql`CAST(pet.id AS TEXT) = media_link.entity_id`),
        )
        .leftJoin('media', 'media.id', 'media_link.media_id')
        .select([
          'pet.id as id',
          'pet.name as name',
          'pet.breed as breed',
          'pet.birth_date as birth_date',
          'media.file_path as avatar_file_path',
        ])
        .where('pet.id', '=', id)
        .executeTakeFirst();
      if (!row) throw new Error('Pet not found');
      const latestPresence = await fetchLatestPresenceForPet(db, id);
      return {
        id: row.id,
        name: row.name,
        breed: row.breed,
        birth_date: row.birth_date,
        avatar_url: row.avatar_file_path
          ? `api/media/${row.avatar_file_path}`
          : undefined,
        is_away: deriveIsAway(latestPresence),
      };
    },
  );

  fastify.patch(
    '/:id',
    {
      schema: {
        params: GetPetParamsSchema,
        body: PatchPetRequestSchema,
        response: {
          '200': GetPetResponseSchema,
        },
      },
    },
    async (request) => {
      const { id } = request.params as { id: number };
      const data = request.body as PatchPetRequestDTO;

      // Build an update object only with provided (non-undefined) fields
      const update: Record<string, unknown> = {};
      const keys: Array<keyof PatchPetRequestDTO> = [
        'name',
        'breed',
        'birth_date',
      ];
      for (const key of keys) {
        const value = data[key];
        if (value !== undefined) update[key] = value;
      }

      if (Object.keys(update).length === 0) {
        // Nothing to update – return current pet
        const existing = await db
          .selectFrom('pet')
          .selectAll()
          .where('id', '=', id)
          .executeTakeFirst();
        if (!existing) throw new Error('Pet not found');
        const avatar = await db
          .selectFrom('media_link')
          .innerJoin('media', 'media.id', 'media_link.media_id')
          .select(['media.file_path'])
          .where('media_link.entity_type', '=', 'pet')
          .where('media_link.entity_id', '=', String(id))
          .where('media_link.relation', '=', 'avatar')
          .executeTakeFirst();
        const latestPresence = await fetchLatestPresenceForPet(db, id);
        return {
          ...existing,
          avatar_url: avatar ? `api/media/${avatar.file_path}` : undefined,
          is_away: deriveIsAway(latestPresence),
        };
      }

      const result = await db
        .updateTable('pet')
        .set(update)
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirst();

      if (!result) throw new Error('Pet not found');
      const [avatar, latestPresence] = await Promise.all([
        db
          .selectFrom('media_link')
          .innerJoin('media', 'media.id', 'media_link.media_id')
          .select(['media.file_path'])
          .where('media_link.entity_type', '=', 'pet')
          .where('media_link.entity_id', '=', String(id))
          .where('media_link.relation', '=', 'avatar')
          .executeTakeFirst(),
        fetchLatestPresenceForPet(db, id),
      ]);
      const avatar_url = avatar ? `api/media/${avatar.file_path}` : undefined;
      return {
        ...result,
        avatar_url,
        is_away: deriveIsAway(latestPresence),
      };
    },
  );

  fastify.post(
    '/:id/presence/toggle',
    {
      schema: {
        params: TogglePetPresenceParamsSchema,
        response: {
          '200': TogglePetPresenceResponseSchema,
          '404': Type.Object({ error: Type.String() }),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const pet = await db
        .selectFrom('pet')
        .select('id')
        .where('id', '=', id)
        .executeTakeFirst();
      if (!pet) {
        return reply.status(404).send({ error: 'Pet not found' });
      }

      const latestPresence = await fetchLatestPresenceForPet(db, id);
      const data = buildToggledPresenceData(latestPresence);

      const eventId = await recordPetPresenceEvent(
        { db },
        {
          petId: id,
          data,
          human_verified: true,
        },
      );

      const event = await db
        .selectFrom('event')
        .selectAll()
        .where('id', '=', eventId)
        .executeTakeFirstOrThrow();

      return {
        is_away: deriveIsAway(data),
        event: serializeEventRow(event),
      };
    },
  );

  fastify.delete(
    '/:id',
    {
      schema: {
        params: GetPetParamsSchema,
        response: {
          '200': Type.Object({ success: Type.Boolean() }),
        },
      },
    },
    async (request) => {
      const { id } = request.params as { id: number };
      const existing = await db
        .selectFrom('pet')
        .select('id')
        .where('id', '=', id)
        .executeTakeFirst();
      if (!existing) throw new Error('Pet not found');
      await db.deleteFrom('pet').where('id', '=', id).execute();
      return { success: true };
    },
  );

  // Upload / replace avatar
  fastify.post(
    '/:id/avatar',
    {
      schema: {
        params: GetPetParamsSchema,
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      // Ensure pet exists
      const pet = await db
        .selectFrom('pet')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      if (!pet) return reply.status(404).send({ error: 'Pet not found' });

      const isMultipart = request.isMultipart();
      if (!isMultipart) {
        return reply
          .status(400)
          .send({ error: 'Expected multipart/form-data' });
      }
      const partsIter = request.parts();
      let filePart: MultipartFile | undefined;
      for await (const part of partsIter) {
        if (part.type === 'file' && part.fieldname === 'avatar') {
          filePart = part;
          break;
        }
      }
      if (!filePart) {
        return reply.status(400).send({ error: 'Missing avatar file' });
      }
      const allowed = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowed.includes(filePart.mimetype)) {
        return reply.status(415).send({ error: 'Unsupported file type' });
      }

      // Read file into buffer (enforced size via multipart limits)
      const chunks: Buffer[] = [];
      for await (const chunk of filePart.file) {
        chunks.push(Buffer.from(chunk));
      }
      const fileBuffer = Buffer.concat(chunks);

      // Process image via sharp: square crop + resize to 256px + webp
      const img = sharp(fileBuffer, { failOnError: true });
      const metadata = await img.metadata();
      if (!metadata.width || !metadata.height) {
        return reply.status(400).send({ error: 'Invalid image' });
      }
      const size = Math.min(metadata.width, metadata.height);
      const processed = await img
        .extract({
          left: Math.floor((metadata.width - size) / 2),
          top: Math.floor((metadata.height - size) / 2),
          width: size,
          height: size,
        })
        .resize(256, 256)
        .webp({ quality: 80 })
        .toBuffer();

      const mediaRoot = getMediaPath();
      const petDir = path.join(mediaRoot, 'pets', String(id));
      await fs.mkdir(petDir, { recursive: true });
      const avatarFilename = 'avatar_256.webp';
      const avatarPath = path.join(petDir, avatarFilename);
      // Remove existing avatar BEFORE writing new file to avoid deleting the freshly written one.
      // Previously we wrote the new file and then deleted the old avatar (same path), which resulted
      // in unlinking the just-written file. Reordering fixes the issue.
      const existingAvatar = await db
        .selectFrom('media_link')
        .innerJoin('media', 'media.id', 'media_link.media_id')
        .select([
          'media_link.id as link_id',
          'media.id as media_id',
          'media.file_path',
        ])
        .where('media_link.entity_type', '=', 'pet')
        .where('media_link.entity_id', '=', String(id))
        .where('media_link.relation', '=', 'avatar')
        .executeTakeFirst();
      if (existingAvatar) {
        await db
          .deleteFrom('media_link')
          .where('id', '=', existingAvatar.link_id)
          .execute();
        await db
          .deleteFrom('media')
          .where('id', '=', existingAvatar.media_id)
          .execute();
        try {
          if (existingAvatar.file_path) {
            await fs.unlink(path.join(mediaRoot, existingAvatar.file_path));
          }
        } catch (error: unknown) {
          void error; // swallow unlink errors
        }
      }

      // Now write the new file safely.
      await fs.writeFile(avatarPath, processed);

      // Insert media
      const relFilePath = path.join('pets', String(id), avatarFilename);
      const now = Math.floor(Date.now() / 1000);
      const mediaRow = await db
        .insertInto('media')
        .values({
          file_path: relFilePath,
          mime_type: 'image/webp',
          file_size: processed.length,
          description: 'Pet avatar',
          metadata: { width: 256, height: 256 },
          created_at: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Link media to pet as avatar
      await db
        .insertInto('media_link')
        .values({
          media_id: mediaRow.id as number,
          entity_type: 'pet',
          entity_id: String(id),
          relation: 'avatar',
          created_at: now,
        })
        .execute();

      return reply.send({
        success: true,
        avatar: {
          url: `api/media/${relFilePath}`,
          width: 256,
          height: 256,
        },
      });
    },
  );

  // Delete avatar
  fastify.delete('/:id/avatar', async (request, reply) => {
    const { id } = request.params as { id: number };
    const link = await db
      .selectFrom('media_link')
      .innerJoin('media', 'media.id', 'media_link.media_id')
      .select([
        'media_link.id as link_id',
        'media.id as media_id',
        'media.file_path',
      ])
      .where('media_link.entity_type', '=', 'pet')
      .where('media_link.entity_id', '=', String(id))
      .where('media_link.relation', '=', 'avatar')
      .executeTakeFirst();
    if (!link) return reply.send({ success: true }); // idempotent
    await db.deleteFrom('media_link').where('id', '=', link.link_id).execute();
    await db.deleteFrom('media').where('id', '=', link.media_id).execute();
    try {
      if (link.file_path) {
        await fs.unlink(path.join(getMediaPath(), link.file_path));
      }
    } catch (error: unknown) {
      // ignore unlink errors
      void error;
    }
    return reply.send({ success: true });
  });

  // Get avatar metadata (lightweight)
  fastify.get('/:id/avatar', async (request, reply) => {
    const { id } = request.params as { id: number };
    const avatar = await db
      .selectFrom('media_link')
      .innerJoin('media', 'media.id', 'media_link.media_id')
      .select(['media.file_path', 'media.metadata'])
      .where('media_link.entity_type', '=', 'pet')
      .where('media_link.entity_id', '=', String(id))
      .where('media_link.relation', '=', 'avatar')
      .executeTakeFirst();
    if (!avatar) return reply.status(404).send({ error: 'Avatar not found' });
    return reply.send({
      url: `api/media/${avatar.file_path}`,
      metadata: avatar.metadata,
    });
  });
};
export default petRoutes;
