import {
  GetFoodSchema,
  GetFoodsResponseSchema,
  GetFoodParamsSchema,
  PostFoodRequestSchema,
  PatchFoodRequestSchema,
  DeleteFoodParamsSchema,
  DeleteFoodResponseSchema,
} from 'shared';
import { type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { db } from '../database/index.ts';
import type { PatchFoodRequestDTO } from 'shared';

const foodRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get(
    '/',
    {
      schema: {
        response: {
          '200': GetFoodsResponseSchema,
        },
      },
    },
    async () => {
      const rows = await db
        .selectFrom('food')
        .selectAll()
        .orderBy('name', 'asc')
        .execute();
      return rows.map((r) => ({
        ...r,
        nutrients:
          typeof r.nutrients === 'string'
            ? (JSON.parse(r.nutrients) as typeof r.nutrients)
            : r.nutrients,
      }));
    },
  );

  fastify.post(
    '/',
    {
      schema: {
        body: PostFoodRequestSchema,
        response: {
          '200': GetFoodSchema,
        },
      },
    },
    async (request) => {
      const body = request.body;
      const result = await db
        .insertInto('food')
        .values({
          name: body.name,
          brand: body.brand ?? null,
          food_type: body.food_type,
          barcode_ean13: body.barcode_ean13 ?? null,
          moisture_percent: body.moisture_percent ?? null,
          calories_per_100g: body.calories_per_100g ?? null,
          nutrients:
            body.nutrients != null ? JSON.stringify(body.nutrients) : null,
          serving_size_g: body.serving_size_g ?? null,
          notes: body.notes ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return {
        ...result,
        nutrients:
          typeof result.nutrients === 'string'
            ? (JSON.parse(result.nutrients) as typeof result.nutrients)
            : result.nutrients,
      };
    },
  );

  fastify.get(
    '/:id',
    {
      schema: {
        params: GetFoodParamsSchema,
        response: {
          '200': GetFoodSchema,
        },
      },
    },
    async (request) => {
      const { id } = request.params;
      const row = await db
        .selectFrom('food')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      if (!row) throw new Error('Food not found');
      return {
        ...row,
        nutrients:
          typeof row.nutrients === 'string'
            ? (JSON.parse(row.nutrients) as typeof row.nutrients)
            : row.nutrients,
      };
    },
  );

  fastify.patch(
    '/:id',
    {
      schema: {
        params: GetFoodParamsSchema,
        body: PatchFoodRequestSchema,
        response: {
          '200': GetFoodSchema,
        },
      },
    },
    async (request) => {
      const { id } = request.params;
      const data = request.body as PatchFoodRequestDTO;

      const update: Record<string, unknown> = {};
      const keys = [
        'name',
        'brand',
        'food_type',
        'barcode_ean13',
        'moisture_percent',
        'calories_per_100g',
        'nutrients',
        'serving_size_g',
        'notes',
      ] as const;
      for (const key of keys) {
        const value = data[key];
        if (value !== undefined) {
          update[key] =
            key === 'nutrients' && value != null ? JSON.stringify(value) : value;
        }
      }

      if (Object.keys(update).length === 0) {
        const existing = await db
          .selectFrom('food')
          .selectAll()
          .where('id', '=', id)
          .executeTakeFirst();
        if (!existing) throw new Error('Food not found');
        return {
          ...existing,
          nutrients:
            typeof existing.nutrients === 'string'
              ? (JSON.parse(existing.nutrients) as typeof existing.nutrients)
              : existing.nutrients,
        };
      }

      update.updated_at = Math.floor(Date.now() / 1000);
      const result = await db
        .updateTable('food')
        .set(update as Record<string, number | string | null>)
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirst();
      if (!result) throw new Error('Food not found');
      return {
        ...result,
        nutrients:
          typeof result.nutrients === 'string'
            ? (JSON.parse(result.nutrients) as typeof result.nutrients)
            : result.nutrients,
      };
    },
  );

  fastify.delete(
    '/:id',
    {
      schema: {
        params: DeleteFoodParamsSchema,
        response: {
          '200': DeleteFoodResponseSchema,
        },
      },
    },
    async (request) => {
      const { id } = request.params;
      const existing = await db
        .selectFrom('food')
        .select('id')
        .where('id', '=', id)
        .executeTakeFirst();
      if (!existing) throw new Error('Food not found');
      await db.deleteFrom('food').where('id', '=', id).execute();
      return { success: true };
    },
  );
};

export default foodRoutes;
