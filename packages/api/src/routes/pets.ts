import { getMediaPath } from '../mediaPaths.ts';
import { sql, type Kysely } from 'kysely';
import path from 'node:path';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import type { MultipartFile } from '@fastify/multipart';
import { format } from 'date-fns';
import {
  GetPetParamsSchema,
  GetPetResponseSchema,
  GetPetsResponseSchema,
  PostPetRequestSchema,
  PatchPetRequestSchema,
  PutPetPresenceRequestSchema,
  PutPetPresenceResponseSchema,
  PostPetAvatarResponseSchema,
  PET_AVATAR_MAX_BYTES,
  PET_AVATAR_MIME_TYPES,
  GetPetAvatarResponseSchema,
  type GetPetResponseDTO,
} from 'shared';
import { requireSerializedEventRow } from './mappers/events.ts';
import {
  Type,
  type FastifyPluginAsyncTypebox,
  type Static,
} from '@fastify/type-provider-typebox';
import {
  checkPresenceWrite,
  presenceAt,
  isProfileClosed,
  toPreviousState,
  type PresenceRecord,
} from '../services/events/petPresence.ts';
import { recordPetPresenceEvent } from '../services/events/recordPetPresenceEvent.ts';
import type { Database } from '../database/index.ts';
import type { PetUpdate } from '../database/types/PetTable.ts';
import type { PetPresenceEventData } from '../domain/events.ts';
import {
  Http400BadRequestSchema,
  Http404NotFoundSchema,
  Http409ConflictSchema,
  Http413PayloadTooLargeSchema,
  Http415UnsupportedMediaTypeSchema,
} from './httpErrorSchemas.ts';

const PET_NOT_FOUND: Static<typeof Http404NotFoundSchema> = {
  statusCode: 404,
  error: 'Not Found',
  message: 'Pet not found',
};

const AVATAR_NOT_FOUND: Static<typeof Http404NotFoundSchema> = {
  statusCode: 404,
  error: 'Not Found',
  message: 'Avatar not found',
};

function formatBirthDate(value: Date | string | null): string | null {
  if (value == null) return null;
  return typeof value === 'string' ? value : format(value, 'yyyy-MM-dd');
}

/** Present wire value only — caller owns PATCH presence (`!== undefined`). */
function parseBirthDate(value: string | null): Date | null {
  if (value == null) return null;
  return new Date(`${value}T00:00:00`);
}

/** The schema has already checked the digit count; storage keeps digits only. */
function normalizeMicrochip(value: string | null): string | null {
  if (value == null) return null;
  return value.replace(/\s+/g, '');
}

/**
 * Advertise avatar_url only when the media row points at a file that exists.
 * Orphaned DB rows (file deleted / media folder out of sync) must not produce
 * a URL that 404s via `/api/media/`.
 */
async function avatarUrlForFilePath(
  filePath: string | null | undefined,
): Promise<string | undefined> {
  if (!filePath) return undefined;
  try {
    await fs.access(path.join(getMediaPath(), filePath));
  } catch {
    return undefined;
  }
  return `api/media/${filePath}`;
}

function presenceResponse(
  record: PresenceRecord | undefined,
): Pick<GetPetResponseDTO, 'presence' | 'closed_at'> {
  if (!record) return { presence: null, closed_at: null };
  const { state, context } = record.data;
  return {
    presence: context ? { state, context } : { state },
    closed_at: isProfileClosed(record.data)
      ? record.timestamp.toISOString()
      : null,
  };
}

/** Pets with their avatar and current presence; every pet route answers with this. */
async function loadPets(
  db: Kysely<Database>,
  ids?: readonly number[],
): Promise<GetPetResponseDTO[]> {
  if (ids?.length === 0) return [];
  let query = db
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
      'pet.microchip as microchip',
      'pet.sex as sex',
      'pet.altered as altered',
      'media.file_path as avatar_file_path',
    ]);
  if (ids) query = query.where('pet.id', 'in', [...ids]);
  const rows = await query.execute();

  const presenceByPet = await presenceAt(
    db,
    rows.map((row) => row.id),
  );
  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      name: row.name,
      breed: row.breed,
      birth_date: formatBirthDate(row.birth_date),
      microchip: row.microchip,
      sex: row.sex,
      altered: row.altered,
      avatar_url: await avatarUrlForFilePath(row.avatar_file_path),
      ...presenceResponse(presenceByPet.get(row.id)),
    })),
  );
}

async function loadPet(
  db: Kysely<Database>,
  id: number,
): Promise<GetPetResponseDTO | undefined> {
  const [pet] = await loadPets(db, [id]);
  return pet;
}

/**
 * Closes or reopens a profile by recording the presence event that decides
 * it (see `isProfileClosed`); a closed period is then untracked in analytics
 * the same way an away one is. Already in that state writes nothing.
 */
async function setProfileClosed(
  db: Kysely<Database>,
  id: number,
  closed: boolean,
): Promise<GetPetResponseDTO | undefined> {
  const pet = await loadPet(db, id);
  if (!pet || (pet.closed_at != null) === closed) return pet;

  await recordPetPresenceEvent(
    { db },
    {
      petId: id,
      data: {
        type: 'pet_presence',
        ...(closed
          ? { state: 'away', context: 'profile_closed' }
          : { state: 'home', context: 'profile_reopened' }),
        previous_state: toPreviousState(pet.presence),
      },
      human_verified: true,
    },
  );
  return loadPet(db, id);
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
    async () => loadPets(db),
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
      const { name, breed, birth_date, microchip, sex, altered } = request.body;

      const result = await db
        .insertInto('pet')
        .values({
          name,
          breed,
          birth_date: parseBirthDate(birth_date ?? null),
          microchip: normalizeMicrochip(microchip ?? null),
          ...(sex ? { sex } : {}),
          ...(altered ? { altered } : {}),
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      const pet = await loadPet(db, result.id);
      if (!pet) throw new Error(`Pet ${result.id} vanished after insert`);
      return pet;
    },
  );

  fastify.get(
    '/:id',
    {
      schema: {
        params: GetPetParamsSchema,
        response: {
          '200': GetPetResponseSchema,
          '404': Http404NotFoundSchema,
        },
      },
    },
    async (request, reply) => {
      const pet = await loadPet(db, request.params.id);
      if (!pet) return reply.code(404).send(PET_NOT_FOUND);
      return pet;
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
          '404': Http404NotFoundSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const data = request.body;

      const update: PetUpdate = {};
      if (data.name !== undefined) update.name = data.name;
      if (data.breed !== undefined) update.breed = data.breed;
      if (data.birth_date !== undefined) {
        update.birth_date = parseBirthDate(data.birth_date);
      }
      if (data.microchip !== undefined) {
        update.microchip = normalizeMicrochip(data.microchip);
      }
      if (data.sex !== undefined) update.sex = data.sex;
      if (data.altered !== undefined) update.altered = data.altered;

      if (Object.keys(update).length > 0) {
        await db.updateTable('pet').set(update).where('id', '=', id).execute();
      }
      const pet = await loadPet(db, id);
      if (!pet) return reply.code(404).send(PET_NOT_FOUND);
      return pet;
    },
  );

  fastify.put(
    '/:id/presence',
    {
      schema: {
        params: GetPetParamsSchema,
        body: PutPetPresenceRequestSchema,
        response: {
          '200': PutPetPresenceResponseSchema,
          '400': Http400BadRequestSchema,
          '404': Http404NotFoundSchema,
          '409': Http409ConflictSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { state, context } = request.body;

      const [pet, presence] = await Promise.all([
        db
          .selectFrom('pet')
          .select('id')
          .where('id', '=', id)
          .executeTakeFirst(),
        presenceAt(db, [id]),
      ]);
      if (!pet) return reply.code(404).send(PET_NOT_FOUND);

      const data: PetPresenceEventData = {
        type: 'pet_presence',
        state,
        ...(context ? { context } : {}),
      };
      checkPresenceWrite(
        { incoming: { petId: id, data }, existing: null },
        presence,
      );

      const latest = presence.get(id)?.data ?? null;
      if (latest?.state === state && latest.context === context) {
        return { presence: request.body, event: null };
      }

      const eventId = await recordPetPresenceEvent(
        { db },
        {
          petId: id,
          data: { ...data, previous_state: toPreviousState(latest) },
          human_verified: true,
        },
      );
      const event = await db
        .selectFrom('event')
        .selectAll()
        .where('id', '=', eventId)
        .executeTakeFirstOrThrow();

      return {
        presence: request.body,
        event: requireSerializedEventRow(event),
      };
    },
  );

  const profileRouteSchema = {
    params: GetPetParamsSchema,
    response: {
      '200': GetPetResponseSchema,
      '404': Http404NotFoundSchema,
    },
  };

  fastify.post(
    '/:id/close-profile',
    { schema: profileRouteSchema },
    async (request, reply) => {
      const pet = await setProfileClosed(db, request.params.id, true);
      if (!pet) return reply.code(404).send(PET_NOT_FOUND);
      return pet;
    },
  );

  fastify.post(
    '/:id/reopen-profile',
    { schema: profileRouteSchema },
    async (request, reply) => {
      const pet = await setProfileClosed(db, request.params.id, false);
      if (!pet) return reply.code(404).send(PET_NOT_FOUND);
      return pet;
    },
  );

  fastify.delete(
    '/:id',
    {
      schema: {
        params: GetPetParamsSchema,
        response: {
          '200': Type.Object({ success: Type.Boolean() }),
          '404': Http404NotFoundSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const existing = await db
        .selectFrom('pet')
        .select('id')
        .where('id', '=', id)
        .executeTakeFirst();
      if (!existing) return reply.code(404).send(PET_NOT_FOUND);
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
        response: {
          '200': PostPetAvatarResponseSchema,
          '400': Http400BadRequestSchema,
          '404': Http404NotFoundSchema,
          '413': Http413PayloadTooLargeSchema,
          '415': Http415UnsupportedMediaTypeSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const pet = await db
        .selectFrom('pet')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      if (!pet) return reply.code(404).send(PET_NOT_FOUND);

      const isMultipart = request.isMultipart();
      if (!isMultipart) {
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Expected multipart/form-data',
        });
      }
      const partsIter = request.parts({
        limits: { fileSize: PET_AVATAR_MAX_BYTES },
      });
      let filePart: MultipartFile | undefined;
      for await (const part of partsIter) {
        if (part.type === 'file' && part.fieldname === 'avatar') {
          filePart = part;
          break;
        }
      }
      if (!filePart) {
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Missing avatar file',
        });
      }
      if (!PET_AVATAR_MIME_TYPES.includes(filePart.mimetype)) {
        return reply.code(415).send({
          statusCode: 415,
          error: 'Unsupported Media Type',
          message: 'Unsupported file type',
        });
      }

      // `toBuffer` is where the multipart size limit throws its 413; reading
      // the raw stream would hand a silently truncated file to sharp instead.
      const fileBuffer = await filePart.toBuffer();

      // Process image via sharp: square crop + resize to 256px + webp
      const img = sharp(fileBuffer, { failOnError: true });
      const metadata = await img.metadata();
      if (!metadata.width || !metadata.height) {
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid image',
        });
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
      // The old and new avatar share a path, so the old one is removed before
      // the new file is written; the other order would unlink the new file.
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
          media_id: mediaRow.id,
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
  fastify.delete(
    '/:id/avatar',
    { schema: { params: GetPetParamsSchema } },
    async (request, reply) => {
      const { id } = request.params;
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
      await db
        .deleteFrom('media_link')
        .where('id', '=', link.link_id)
        .execute();
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
    },
  );

  // Get avatar metadata (lightweight)
  fastify.get(
    '/:id/avatar',
    {
      schema: {
        params: GetPetParamsSchema,
        response: {
          '200': GetPetAvatarResponseSchema,
          '404': Http404NotFoundSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const avatar = await db
        .selectFrom('media_link')
        .innerJoin('media', 'media.id', 'media_link.media_id')
        .select(['media.file_path', 'media.metadata'])
        .where('media_link.entity_type', '=', 'pet')
        .where('media_link.entity_id', '=', String(id))
        .where('media_link.relation', '=', 'avatar')
        .executeTakeFirst();
      if (!avatar) return reply.code(404).send(AVATAR_NOT_FOUND);
      const url = await avatarUrlForFilePath(avatar.file_path);
      if (!url) return reply.code(404).send(AVATAR_NOT_FOUND);
      return reply.send({
        url,
        metadata: avatar.metadata,
      });
    },
  );
};
export default petRoutes;
