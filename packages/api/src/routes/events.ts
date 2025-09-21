import { sql } from 'kysely';

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
} from 'shared';

import { db } from '../database/index.ts';
import { type FastifyTypeBox } from '../types.ts';

export default function eventRoutes(fastify: FastifyTypeBox): void {
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
      const { days = 30 } = request.query;

      let query = db
        .selectFrom('event')
        .selectAll()
        .where('pet_id', '=', petId)
        .where(sql`json_extract(data, '$.type')`, '=', 'weight_measurement')
        .orderBy('timestamp', 'asc');

      // Only apply date filter if days is reasonable (not "all time")
      if (days < 9999) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        query = query.where('timestamp', '>=', startDate);
      }

      const weightEvents = await query.execute();

      const trends = weightEvents.map((event) => {
        const data = event.data as { type: string; weight: number };
        return {
          date: event.timestamp.toISOString().split('T')[0],
          weight: data.weight,
          timestamp: event.timestamp.toISOString(),
        };
      });

      return trends;
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
      } = request.query;

      let query = db.selectFrom('event').selectAll();
      let countQuery = db
        .selectFrom('event')
        .select(db.fn.count<number>('id').as('count'));

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
      const { pet_id, device_id, timestamp, data, raw_data } = request.body;

      const result = await db
        .insertInto('event')
        .values({
          pet_id,
          device_id,
          timestamp: timestamp ? new Date(timestamp) : new Date(),
          data,
          raw_data: raw_data ? Buffer.from(raw_data) : null,
          human_verified: false, // Default to false for new events
        })
        .returningAll()
        .executeTakeFirstOrThrow();

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
        .set({
          ...body,
          pet_id: body.pet_id === 0 ? null : body.pet_id,
        })
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
}
