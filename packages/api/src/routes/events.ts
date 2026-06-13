import { sql } from 'kysely';
import { subDays } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

import {
  DeleteEventParamsSchema,
  DeleteEventResponseSchema,
  GetEventSchema,
  GetEventWithChildrenSchema,
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
  FoodTrendParamsSchema,
  FoodTrendQuerySchema,
  FoodTrendsResponseSchema,
  LitterboxTrendParamsSchema,
  LitterboxTrendQuerySchema,
  LitterboxTrendsResponseSchema,
} from 'shared';

import {
  Type,
  type FastifyPluginAsyncTypebox,
} from '@fastify/type-provider-typebox';
import { db } from '../database/index.ts';
import { MediaManager } from '../services/media/MediaManager.ts';
import {
  buildMoistureChildEventValues,
  calculateNutrientsFromFood,
  enrichFoodIntakeEventData,
} from '../services/food/enrichFoodIntake.ts';
import type { FoodIntakeEventData } from '../database/types/EventTable.ts';
import { computeLitterboxAnalysisData } from '../services/devices/providers/esphome/analyzeLitterboxUse.ts';
import type { LitterboxUseEventData } from '../database/types/EventTable.ts';
import type { EventTable } from '../database/types/EventTable.ts';
import { buildLitterboxTrendResult } from '../services/litterbox/litterboxAnalytics.ts';
import {
  buildFoodTrends,
  buildWaterTrends,
} from '../services/analytics/dailyMetricTrends.ts';
import {
  bucketsToUntrackedIntervals,
  computeUntrackedBuckets,
} from '../services/analytics/trendCoverage.ts';
import { isBucketTracked } from '../services/analytics/analyticsCoverage.ts';
import type { Selectable } from 'kysely';

function serializeEventRow(event: Selectable<EventTable>) {
  return {
    ...event,
    raw_data: event.raw_data ? Array.from(event.raw_data) : null,
  };
}

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

      return buildWaterTrends(db, petId, days, timezone);
    },
  );

  fastify.get(
    '/food-trends/:petId',
    {
      schema: {
        params: FoodTrendParamsSchema,
        querystring: FoodTrendQuerySchema,
        response: {
          '200': FoodTrendsResponseSchema,
        },
      },
    },
    async (request) => {
      const { petId } = request.params;
      const { days = 7, timezone = 'UTC' } = request.query;

      return buildFoodTrends(db, petId, days, timezone);
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
      const { startTime, endTime, timezone = 'UTC', detail = false } = request.query;

      const startDate = new Date(startTime);
      const endDate = new Date(endTime);

      const [litterboxEvents, untrackedDayBuckets] = await Promise.all([
        db
          .selectFrom('event')
          .selectAll()
          .where('pet_id', '=', petId)
          .where(sql`json_extract(data, '$.type')`, '=', 'litterbox_use')
          .where('timestamp', '>=', startDate)
          .where('timestamp', '<=', endDate)
          .orderBy('timestamp', 'asc')
          .execute(),
        computeUntrackedBuckets(db, {
          petId,
          deviceClass: 'litterbox',
          range: { start: startDate, end: endDate },
          resolution: 'day',
          timezone,
        }),
      ]);

      return buildLitterboxTrendResult({
        visits: litterboxEvents.map((event) => ({
          id: event.id,
          timestamp: event.timestamp,
          device_id: event.device_id,
          human_verified: event.human_verified,
          data: event.data as LitterboxUseEventData,
        })),
        startTime: startDate,
        endTime: endDate,
        timezone,
        includeDetails: detail,
        untrackedDayBuckets,
      });
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

      const rangeStart =
        days < 9999 ? subDays(new Date(), days) : new Date(0);
      const rangeEnd = new Date();

      let query = db
        .selectFrom('event')
        .selectAll()
        .where('pet_id', '=', petId)
        .where(sql`json_extract(data, '$.type')`, '=', 'weight_measurement')
        .orderBy('timestamp', 'asc');

      if (days < 9999) {
        query = query.where('timestamp', '>=', rangeStart);
      }

      const [weightEvents, untrackedDayBuckets, untrackedHourBuckets] =
        await Promise.all([
          query.execute(),
          computeUntrackedBuckets(db, {
            petId,
            deviceClass: 'litterbox',
            range: { start: rangeStart, end: rangeEnd },
            resolution: 'day',
            timezone,
          }),
          computeUntrackedBuckets(db, {
            petId,
            deviceClass: 'litterbox',
            range: { start: rangeStart, end: rangeEnd },
            resolution: 'hour',
            timezone,
          }),
        ]);

      const todayKey = formatInTimeZone(rangeEnd, timezone, 'yyyy-MM-dd');

      const points = weightEvents.map((event) => {
        const data = event.data as { type: string; weight: number };
        const date = formatInTimeZone(event.timestamp, timezone, 'yyyy-MM-dd');
        return {
          date,
          weight: data.weight,
          timestamp: event.timestamp.toISOString(),
          tracked: isBucketTracked(date, untrackedDayBuckets),
        };
      });

      return {
        points,
        untrackedIntervals: bucketsToUntrackedIntervals(
          untrackedHourBuckets,
          'hour',
          timezone,
        ),
        untrackedDayIntervals: bucketsToUntrackedIntervals(
          untrackedDayBuckets,
          'day',
          timezone,
        ),
        rangeStart: rangeStart.toISOString(),
        rangeEnd: rangeEnd.toISOString(),
        todayTracked: isBucketTracked(todayKey, untrackedDayBuckets),
      };
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
          'media_link.relation',
        ])
        .orderBy('media.created_at', 'asc')
        .orderBy('media.id', 'asc')
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
          '200': GetEventWithChildrenSchema,
          '404': Http404ResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { eventId } = request.params;

      const [event, children] = await Promise.all([
        db
          .selectFrom('event')
          .selectAll()
          .where('id', '=', eventId)
          .where('parent_event_id', 'is', null)
          .executeTakeFirst(),
        db
          .selectFrom('event')
          .selectAll()
          .where('parent_event_id', '=', eventId)
          .orderBy('id')
          .execute(),
      ]);

      if (!event) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Event not found',
        });
      }

      return {
        ...serializeEventRow(event),
        children: children.map(serializeEventRow),
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
        timestamp: bodyTimestamp,
        human_verified: bodyHumanVerified,
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
          eventData = enrichFoodIntakeEventData(
            eventData as FoodIntakeEventData,
            food,
          );
        }
      }

      const eventTimestamp =
        bodyTimestamp != null ? new Date(bodyTimestamp as string | number | Date) : new Date();
      const humanVerified =
        bodyHumanVerified ??
        (eventData?.type === 'food_intake'
          ? true
          : eventData?.type === 'pet_presence'
            ? eventData.context === 'manual'
            : false);

      const result = await db
        .insertInto('event')
        .values({
          parent_event_id: parent_event_id || null,
          pet_id,
          device_id,
          timestamp: eventTimestamp,
          data: eventData,
          raw_data: null,
          human_verified: humanVerified,
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
          .values(
            buildMoistureChildEventValues({
              parentEventId: result.id,
              petId: result.pet_id,
              timestamp: result.timestamp,
              moistureMl: nutrients.moisture_ml,
            }),
          )
          .execute();
      }

      return {
        ...result,
        raw_data: result.raw_data ? Array.from(result.raw_data) : null,
      };
    },
  );

  fastify.post(
    '/:eventId/analyze',
    {
      schema: {
        params: PatchEventParamsSchema,
        response: {
          '200': GetEventSchema,
          '400': Http400BadRequestSchema,
          '404': Http404ResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { eventId } = request.params;

      const eventRow = await db
        .selectFrom('event')
        .selectAll()
        .where('id', '=', eventId)
        .where('parent_event_id', 'is', null)
        .executeTakeFirst();

      if (!eventRow) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Event not found',
        });
      }

      const d = eventRow.data as { type?: string };
      if (d?.type !== 'litterbox_use') {
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Only litterbox_use events can be analyzed',
        });
      }

      const existing = eventRow.data as LitterboxUseEventData;
      const result = await computeLitterboxAnalysisData(db, {
        timestamp: eventRow.timestamp,
        raw_data: eventRow.raw_data,
        existing,
      });

      if (!result.ok) {
        const message =
          result.error === 'no_raw_data' || result.error === 'decode_failed'
            ? 'Missing or invalid litterbox raw_data'
            : 'Analysis failed';
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message,
        });
      }

      const updated = await db
        .updateTable('event')
        .set({ data: result.data })
        .where('id', '=', eventId)
        .returningAll()
        .executeTakeFirstOrThrow();

      return {
        ...updated,
        raw_data: updated.raw_data ? Array.from(updated.raw_data) : null,
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
