import { db } from '../database/index.ts';
import { type FastifyTypeBox } from '../types.ts';
import { Type } from '@sinclair/typebox';
import {
  GetPetParamsSchema,
  GetPetResponseSchema,
  GetPetsResponseSchema,
  PostPetRequestSchema,
  PatchPetRequestSchema,
  type PatchPetRequestDTO,
} from 'shared';

export default function petRoutes(fastify: FastifyTypeBox): void {
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
      return await db.selectFrom('pet').selectAll().execute();
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

      return result;
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
      const pet = await db
        .selectFrom('pet')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      if (!pet) throw new Error('Pet not found');
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
        return existing;
      }

      const result = await db
        .updateTable('pet')
        .set(update)
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirst();

      if (!result) throw new Error('Pet not found');
      return result;
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
}
