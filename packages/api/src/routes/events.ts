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

import { type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { db } from '../database/index.ts';
import type { Food } from '../database/types/FoodTable.ts';

type FoodNutrientItem = { nutrient: string; unit: string; value: number };

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
      const dailyEvents = new Map<string, Array<{ type: LitterboxUseEliminationType; timestamp: string }>>();

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
        const eventData = event.data as { elimination_type?: LitterboxUseEliminationType };
        const eliminationType = eventData.elimination_type || 'unknown';

        if (dailyEvents.has(dateStr)) {
          dailyEvents.get(dateStr)!.push({
            type: eliminationType,
            timestamp: event.timestamp.toISOString(),
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
        },
      },
    },
    async (request) => {
      const { eventId } = request.params;
      const { body } = request;

      const result = await db
        .updateTable('event')
        .set(body)
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

      await db
        .deleteFrom('event')
        .where('id', '=', eventId)
        .executeTakeFirstOrThrow();

      return { success: true };
    },
  );
};

export default eventRoutes;
