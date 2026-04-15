import { sql } from 'kysely';
import { subDays, startOfDay, addDays } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

import {
  DeleteEventParamsSchema,
  DeleteEventResponseSchema,
  GetEventSchema,
  GetEventsQuerySchema,
  GetEventsResponseSchema,
  PatchEventParamsSchema,
  PatchEventRequestSchema,
  PostEventRequestSchema,
  WeightTrendParamsSchema,
  WeightTrendQuerySchema,
  WeightTrendsResponseSchema,
  GetEventMediaResponseSchema,
  WaterTrendParamsSchema,
  WaterTrendQuerySchema,
  WaterTrendsResponseSchema,
  LitterboxTrendParamsSchema,
  LitterboxTrendQuerySchema,
  LitterboxTrendsResponseSchema,
  type LitterboxUseEliminationType,
} from 'shared';

import {
  Type,
  type FastifyPluginAsyncTypebox,
} from '@fastify/type-provider-typebox';
import { db } from '../database/index.ts';
import type { Food } from '../database/types/FoodTable.ts';
import { MediaManager } from '../services/media/MediaManager.ts';

type FoodNutrientItem = { nutrient: string; unit: string; value: number };

const Http404ResponseSchema = Type.Object({
  statusCode: Type.Literal(404),
  error: Type.Literal('Not Found'),
  message: Type.String(),
});

const Http400BadRequestSchema = Type.Object({
  statusCode: Type.Literal(400),
  error: Type.Literal('Bad Request'),
  message: Type.String(),
});

function calculateNutrientsFromFood(
  amount: number,
  food: Food,
): Record<string, number> {
  const nutrients: Record<string, number> = {};
  const nutrientsArray: FoodNutrientItem[] | null =
    typeof food.nutrients === 'string'
      ? (JSON.parse(food.nutrients) as FoodNutrientItem[])
      : food.nutrients;

  if (food.moisture_percent != null) {
    nutrients.moisture_ml = amount * (food.moisture_percent / 100);
  }
  if (food.calories_per_100g != null) {
    nutrients.calories = amount * (food.calories_per_100g / 100);
  }
  if (nutrientsArray && Array.isArray(nutrientsArray)) {
    for (const item of nutrientsArray) {
      const { nutrient, unit, value } = item;
      if (value == null || typeof value !== 'number') continue;
      if (unit === 'percent') {
        nutrients[`${nutrient}_g`] = amount * (value / 100);
      } else if (unit === 'g') {
        nutrients[`${nutrient}_g`] = amount * (value / 100);
      } else if (unit === 'mg') {
        nutrients[`${nutrient}_mg`] = amount * (value / 100);
      }
    }
  }
  return nutrients;
}

const eventRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get(
    '/water-trends/:petId',
    {
      schema: {
        params: WaterTrendParamsSchema,
        querystring: WaterTrendQuerySchema,
        response: {
          '200': WaterTrendsResponseSchema,
        },
      },
    },
    async (request) => {
      const { petId } = request.params;
      const { days = 7, timezone = 'UTC' } = request.query;

      const startDate = startOfDay(subDays(new Date(), days - 1));
      const today = new Date();

      // Fetch water intake events
      const waterEvents = await db
        .selectFrom('event')
        .selectAll()
        .where('pet_id', '=', petId)
        .where(sql`json_extract(data, '$.type')`, '=', 'water_intake')
        .where('timestamp', '>=', startDate)
        .orderBy('timestamp', 'asc')
        .execute();

      // Fetch weight events for the period
      const weightEvents = await db
        .selectFrom('event')
        .selectAll()
        .where('pet_id', '=', petId)
        .where(sql`json_extract(data, '$.type')`, '=', 'weight_measurement')
        .where('timestamp', '>=', startDate)
        .orderBy('timestamp', 'asc')
        .execute();

      // Fetch latest weight before start date
      const lastWeightEvent = await db
        .selectFrom('event')
        .selectAll()
        .where('pet_id', '=', petId)
        .where(sql`json_extract(data, '$.type')`, '=', 'weight_measurement')
        .where('timestamp', '<', startDate)
        .orderBy('timestamp', 'desc')
        .limit(1)
        .executeTakeFirst();

      let currentWeight = lastWeightEvent
        ? (lastWeightEvent.data as { weight: number }).weight
        : 0;

      // If no previous weight, try to use the first weight in the period
      if (currentWeight === 0 && weightEvents.length > 0) {
        currentWeight = (weightEvents[0].data as { weight: number }).weight;
      }

      const dailyStats = new Map<string, { amount: number }>();

      // Initialize days
      for (let i = 0; i < days; i++) {
        const d = subDays(today, days - 1 - i);
        const dateStr = formatInTimeZone(d, timezone, 'yyyy-MM-dd');
        dailyStats.set(dateStr, { amount: 0 });
      }

      // Process water events
      for (const event of waterEvents) {
        const dateStr = formatInTimeZone(event.timestamp, timezone, 'yyyy-MM-dd');
        if (dailyStats.has(dateStr)) {
          const stats = dailyStats.get(dateStr)!;
          const amount = (event.data as { amount: number }).amount || 0;
          stats.amount += amount;
        }
      }

      const result = [];
      let weightEventIndex = 0;

      for (let i = 0; i < days; i++) {
        const d = subDays(today, days - 1 - i);
        const dateStr = formatInTimeZone(d, timezone, 'yyyy-MM-dd');
        const dayStart = new Date(`${dateStr}T00:00:00Z`);
        const nextDay = addDays(dayStart, 1);

        // Find weights for this day
        const dayWeights: number[] = [];
        while (weightEventIndex < weightEvents.length) {
          const we = weightEvents[weightEventIndex];
          if (we.timestamp < nextDay) {
            dayWeights.push((we.data as { weight: number }).weight);
            weightEventIndex++;
          } else {
            break;
          }
        }

        let avgWeight = currentWeight;
        if (dayWeights.length > 0) {
          const sum = dayWeights.reduce((a, b) => a + b, 0);
          avgWeight = sum / dayWeights.length;
          currentWeight = avgWeight; // Update current weight for next days
        }

        const stats = dailyStats.get(dateStr)!;
        const weightInKg = avgWeight / 1000;

        result.push({
          date: dateStr,
          amount: stats.amount,
          tracked: true,
          lowerBound: weightInKg * 40,
          upperBound: weightInKg * 50,
          averageWeight: avgWeight,
        });
      }

      return result;
    },
  );

  fastify.get(
    '/litterbox-trends/:petId',
    {
      schema: {
        params: LitterboxTrendParamsSchema,
        querystring: LitterboxTrendQuerySchema,
        response: {
          '200': LitterboxTrendsResponseSchema,
        },
      },
    },
    async (request) => {
      const { petId } = request.params;
      const { days = 7, timezone = 'UTC' } = request.query;

      const today = new Date();
      const startDate = startOfDay(subDays(today, days - 1));

      // Fetch litterbox events
      const litterboxEvents = await db
        .selectFrom('event')
        .selectAll()
        .where('pet_id', '=', petId)
        .where(sql`json_extract(data, '$.type')`, '=', 'litterbox_use')
        .where('timestamp', '>=', startDate)
        .orderBy('timestamp', 'asc')
        .execute();

      // Group events by local date in the specified timezone
      const dailyEvents = new Map<string, Array<{ type: LitterboxUseEliminationType; timestamp: string; straining?: boolean }>>();

      // Initialize days
      for (let i = 0; i < days; i++) {
        const d = subDays(today, days - 1 - i);
        const dateStr = formatInTimeZone(d, timezone, 'yyyy-MM-dd');
        dailyEvents.set(dateStr, []);
      }

      // Track last pee and poop timestamps
      let lastPee: Date | null = null;
      let lastPoop: Date | null = null;

      // Process events
      for (const event of litterboxEvents) {
        const dateStr = formatInTimeZone(event.timestamp, timezone, 'yyyy-MM-dd');
        const eventData = event.data as { elimination_type?: LitterboxUseEliminationType; straining?: boolean };
        const eliminationType = eventData.elimination_type || 'unknown';

        if (dailyEvents.has(dateStr)) {
          dailyEvents.get(dateStr)!.push({
            type: eliminationType,
            timestamp: event.timestamp.toISOString(),
            ...(eventData.straining ? { straining: true } : {}),
          });
        }

        // Track last pee/poop
        if (eliminationType === 'urination' || eliminationType === 'both') {
          if (!lastPee || event.timestamp > lastPee) {
            lastPee = event.timestamp;
          }
        }
        if (eliminationType === 'defecation' || eliminationType === 'both') {
          if (!lastPoop || event.timestamp > lastPoop) {
            lastPoop = event.timestamp;
          }
        }
      }

      const result = [];
      for (let i = 0; i < days; i++) {
        const d = subDays(today, days - 1 - i);
        const dateStr = formatInTimeZone(d, timezone, 'yyyy-MM-dd');
        result.push({
          date: dateStr,
          events: dailyEvents.get(dateStr) || [],
        });
      }

      return {
        days: result,
        lastPee: lastPee?.toISOString() ?? null,
        lastPoop: lastPoop?.toISOString() ?? null,
      };
    },
  );

  fastify.get(
    '/weight-trends/:petId',
    {
      schema: {
        params: WeightTrendParamsSchema,
        querystring: WeightTrendQuerySchema,
        response: {
          '200': WeightTrendsResponseSchema,
        },
      },
    },
    async (request) => {
      const { petId } = request.params;
      const { days = 30, timezone = 'UTC' } = request.query;

      let query = db
        .selectFrom('event')
        .selectAll()
        .where('pet_id', '=', petId)
        .where(sql`json_extract(data, '$.type')`, '=', 'weight_measurement')
        .orderBy('timestamp', 'asc');

      // Only apply date filter if days is reasonable (not "all time")
      if (days < 9999) {
        const startDate = subDays(new Date(), days);
        query = query.where('timestamp', '>=', startDate);
      }

      const weightEvents = await query.execute();

      const trends = weightEvents.map((event) => {
        const data = event.data as { type: string; weight: number };
        return {
          date: formatInTimeZone(event.timestamp, timezone, 'yyyy-MM-dd'),
          weight: data.weight,
          timestamp: event.timestamp.toISOString(),
        };
      });

      return trends;
    },
  );

  fastify.get(
    '/:eventId/media',
    {
      schema: {
        params: PatchEventParamsSchema,
        response: {
          '200': GetEventMediaResponseSchema,
        },
      },
    },
    async (request) => {
      const { eventId } = request.params;

      const media = await db
        .selectFrom('media_link')
        .innerJoin('media', 'media.id', 'media_link.media_id')
        .where('media_link.entity_type', '=', 'event')
        .where('media_link.entity_id', '=', String(eventId))
        .select([
          'media.id',
          'media.created_at',
          'media.file_path',
          'media.mime_type',
          'media.file_size',
          'media.description',
          'media.metadata',
        ])
        .execute();

      return media.map((m) => ({
        ...m,
        metadata:
          typeof m.metadata === 'string' ? JSON.parse(m.metadata) : m.metadata,
      }));
    },
  );

  fastify.get(
    '/',
    {
      schema: {
        querystring: GetEventsQuerySchema,
        response: {
          '200': GetEventsResponseSchema,
        },
      },
    },
    async (request) => {
      const {
        pet_id,
        device_id,
        startTime,
        endTime,
        limit = 100,
        offset = 0,
        includeChildren = false,
        human_verified,
      } = request.query;

      let query = db.selectFrom('event').selectAll();
      let countQuery = db
        .selectFrom('event')
        .select(db.fn.count<number>('id').as('count'));

      if (!includeChildren) {
        query = query.where('parent_event_id', 'is', null);
        countQuery = countQuery.where('parent_event_id', 'is', null);
      }

      if (pet_id !== undefined) {
        query = query.where('pet_id', '=', pet_id);
        countQuery = countQuery.where('pet_id', '=', pet_id);
      }

      if (device_id !== undefined) {
        query = query.where('device_id', '=', device_id);
        countQuery = countQuery.where('device_id', '=', device_id);
      }

      if (human_verified !== undefined) {
        query = query.where('human_verified', '=', human_verified);
        countQuery = countQuery.where('human_verified', '=', human_verified);
      }

      if (startTime !== undefined) {
        const start = new Date(startTime);
        query = query.where('timestamp', '>=', start);
        countQuery = countQuery.where('timestamp', '>=', start);
      }

      if (endTime !== undefined) {
        const end = new Date(endTime);
        query = query.where('timestamp', '<=', end);
        countQuery = countQuery.where('timestamp', '<=', end);
      }

      // Order by timestamp descending (newest first)
      query = query.orderBy('timestamp', 'desc');

      // Apply pagination
      query = query.limit(limit).offset(offset);

      const [events, countResult] = await Promise.all([
        query.execute(),
        countQuery.executeTakeFirst(),
      ]);

      const total = countResult?.count || 0;
      const hasMore = offset + events.length < total;

      return {
        data: events.map((event) => ({
          ...event,
          raw_data: event.raw_data ? Array.from(event.raw_data) : null,
        })),
        total,
        limit,
        offset,
        hasMore,
      };
    },
  );

  fastify.get(
    '/:eventId',
    {
      schema: {
        params: PatchEventParamsSchema,
        response: {
          '200': GetEventSchema,
          '404': Http404ResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { eventId } = request.params;

      const event = await db
        .selectFrom('event')
        .selectAll()
        .where('id', '=', eventId)
        .where('parent_event_id', 'is', null)
        .executeTakeFirst();

      if (!event) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Event not found',
        });
      }

      return {
        ...event,
        raw_data: event.raw_data ? Array.from(event.raw_data) : null,
      };
    },
  );

  fastify.post(
    '/',
    {
      schema: {
        body: PostEventRequestSchema,
        response: {
          '200': GetEventSchema,
        },
      },
    },
    async (request) => {
      const {
        pet_id,
        device_id,
        data,
        parent_event_id,
      } = request.body;

      let eventData = data;
      let nutrients: Record<string, number> | undefined;

      if (
        eventData?.type === 'food_intake' &&
        typeof eventData.food_id === 'number'
      ) {
        const food = await db
          .selectFrom('food')
          .selectAll()
          .where('id', '=', eventData.food_id)
          .executeTakeFirst();
        if (food && typeof eventData.amount === 'number') {
          nutrients = calculateNutrientsFromFood(eventData.amount, food);
          eventData = { ...eventData, nutrients };
        }
      }

      const result = await db
        .insertInto('event')
        .values({
          parent_event_id: parent_event_id || null,
          pet_id,
          device_id,
          timestamp: new Date(),
          data: eventData,
          raw_data: null,
          human_verified: eventData?.type === 'food_intake' ? true : false,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      if (
        nutrients?.moisture_ml != null &&
        result.data &&
        (result.data as { type: string }).type === 'food_intake'
      ) {
        await db
          .insertInto('event')
          .values({
            parent_event_id: result.id,
            pet_id: result.pet_id,
            device_id: null,
            timestamp: result.timestamp,
            data: {
              type: 'water_intake',
              amount: nutrients.moisture_ml,
              source: 'food',
            },
            raw_data: null,
            human_verified: true,
          })
          .execute();
      }

      return {
        ...result,
        raw_data: result.raw_data ? Array.from(result.raw_data) : null,
      };
    },
  );

  fastify.patch(
    '/:eventId',
    {
      schema: {
        params: PatchEventParamsSchema,
        body: PatchEventRequestSchema,
        response: {
          '200': GetEventSchema,
          '400': Http400BadRequestSchema,
          '404': Http404ResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { eventId } = request.params;
      const body = request.body;

      const existing = await db
        .selectFrom('event')
        .select(['id', 'pet_id', 'device_id', 'parent_event_id'])
        .where('id', '=', eventId)
        .executeTakeFirst();

      if (!existing) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Event not found',
        });
      }

      // SQLite re-checks all FK columns on UPDATE. Orphaned references (e.g. device removed while
      // foreign_keys were off, or manual DB edits) would make any PATCH fail with SQLITE_CONSTRAINT_FOREIGNKEY
      // even when the client only updates `data`. Clear broken references before applying the patch.
      const fkRepair: {
        pet_id?: null;
        device_id?: null;
        parent_event_id?: null;
      } = {};

      if (existing.pet_id != null) {
        const ok = await db
          .selectFrom('pet')
          .select('id')
          .where('id', '=', existing.pet_id)
          .executeTakeFirst();
        if (!ok) fkRepair.pet_id = null;
      }
      if (existing.device_id != null) {
        const ok = await db
          .selectFrom('device')
          .select('id')
          .where('id', '=', existing.device_id)
          .executeTakeFirst();
        if (!ok) fkRepair.device_id = null;
      }
      if (existing.parent_event_id != null) {
        const ok = await db
          .selectFrom('event')
          .select('id')
          .where('id', '=', existing.parent_event_id)
          .executeTakeFirst();
        if (!ok) fkRepair.parent_event_id = null;
      }

      // Only validate FK for a real pet row id (positive integer). 0 / NaN / null must not hit this lookup.
      let patchBody = body;
      if (body.pet_id !== undefined && body.pet_id !== null) {
        const p = body.pet_id;
        const invalidPetId =
          typeof p !== 'number' ||
          !Number.isInteger(p) ||
          p < 1;
        if (invalidPetId) {
          patchBody = { ...body, pet_id: null };
        } else {
          const ok = await db
            .selectFrom('pet')
            .select('id')
            .where('id', '=', p)
            .executeTakeFirst();
          if (!ok) {
            return reply.code(400).send({
              statusCode: 400,
              error: 'Bad Request',
              message: 'pet_id does not exist',
            });
          }
        }
      }

      const result = await db
        .updateTable('event')
        .set({ ...fkRepair, ...patchBody })
        .where('id', '=', eventId)
        .returningAll()
        .executeTakeFirstOrThrow();

      return {
        ...result,
        raw_data: result.raw_data ? Array.from(result.raw_data) : null,
      };
    },
  );

  fastify.delete(
    '/:eventId',
    {
      schema: {
        params: DeleteEventParamsSchema,
        response: {
          '200': DeleteEventResponseSchema,
        },
      },
    },
    async (request) => {
      const { eventId } = request.params;
      const eventIdStr = String(eventId);

      const filesToUnlink: string[] = [];

      await db.transaction().execute(async (trx) => {
        const eventMedia = await trx
          .selectFrom('media_link')
          .innerJoin('media', 'media.id', 'media_link.media_id')
          .select(['media_link.media_id as media_id', 'media.file_path as file_path'])
          .where('media_link.entity_type', '=', 'event')
          .where('media_link.entity_id', '=', eventIdStr)
          .execute();

        await trx
          .deleteFrom('media_link')
          .where('entity_type', '=', 'event')
          .where('entity_id', '=', eventIdStr)
          .execute();

        await trx
          .deleteFrom('event')
          .where('id', '=', eventId)
          .executeTakeFirstOrThrow();

        for (const { media_id, file_path } of eventMedia) {
          const otherLinks = await trx
            .selectFrom('media_link')
            .select(trx.fn.countAll().as('count'))
            .where('media_id', '=', media_id)
            .executeTakeFirst();
          if (otherLinks && Number(otherLinks.count) === 0) {
            await trx.deleteFrom('media').where('id', '=', media_id).execute();
            if (file_path) filesToUnlink.push(file_path);
          }
        }
      });

      const mediaManager = new MediaManager(db);
      await Promise.all(
        filesToUnlink.map((filePath) => mediaManager.unlinkPersistedFile(filePath)),
      );

      return { success: true };
    },
  );
};

export default eventRoutes;
