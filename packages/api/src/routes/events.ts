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
import { MediaManager } from '../services/media/MediaManager.ts';
import {
  buildMoistureChildEventValues,
  calculateNutrientsFromFood,
  enrichFoodIntakeEventData,
} from '../services/food/enrichFoodIntake.ts';
import { computeLitterboxAnalysisData } from '../services/devices/providers/esphome/analyzeLitterboxUse.ts';
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

import type { EventCauseDTO, GetEventListItemDTO } from 'shared';
import { parseStoredEventData } from '../database/types/storedEventData.ts';
import {
  eventDataFromDto,
  requireSerializedEventRow,
  serializeEventListRow,
  serializeEventRow,
} from './mappers/events.ts';
import {
  attributionColumns,
  attributionColumnsFromRequest,
} from '../domain/eventAttribution.ts';
import type { EventData } from '../domain/events.ts';

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
  const { db } = fastify;
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
      const {
        startTime,
        endTime,
        timezone = 'UTC',
        detail = false,
      } = request.query;

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
        visits: litterboxEvents.flatMap((event) => {
          const data = parseStoredEventData(event.data);
          if (data?.type !== 'litterbox_use') {
            fastify.log.warn(
              { eventId: event.id },
              'Skipping invalid litterbox event in trends',
            );
            return [];
          }
          return [
            {
              id: event.id,
              timestamp: event.timestamp,
              device_id: event.device_id,
              human_verified: event.human_verified,
              data,
            },
          ];
        }),
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

      const rangeStart = days < 9999 ? subDays(new Date(), days) : new Date(0);
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

      const points = weightEvents.flatMap((event) => {
        const data = parseStoredEventData(event.data);
        if (data?.type !== 'weight_measurement') return [];
        const date = formatInTimeZone(event.timestamp, timezone, 'yyyy-MM-dd');
        return [
          {
            date,
            weight: data.weight,
            timestamp: event.timestamp.toISOString(),
            tracked: isBucketTracked(date, untrackedDayBuckets),
          },
        ];
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
        caused_by,
        attributed_by,
        device_id,
        startTime,
        endTime,
        limit = 100,
        offset = 0,
        includeChildren = false,
        human_verified,
        eventType,
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

      // `caused_by=unknown` is the review queue: everything nothing has decided.
      if (caused_by !== undefined) {
        query = query.where('caused_by', '=', caused_by);
        countQuery = countQuery.where('caused_by', '=', caused_by);
      }

      if (attributed_by !== undefined) {
        query = query.where('attributed_by', '=', attributed_by);
        countQuery = countQuery.where('attributed_by', '=', attributed_by);
      }

      if (device_id !== undefined) {
        query = query.where('device_id', '=', device_id);
        countQuery = countQuery.where('device_id', '=', device_id);
      }

      if (human_verified !== undefined) {
        query = query.where('human_verified', '=', human_verified);
        countQuery = countQuery.where('human_verified', '=', human_verified);
      }

      if (eventType !== undefined) {
        query = query.where(sql`json_extract(data, '$.type')`, '=', eventType);
        countQuery = countQuery.where(
          sql`json_extract(data, '$.type')`,
          '=',
          eventType,
        );
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
      const serializedEvents: GetEventListItemDTO[] = [];
      for (const event of events) {
        const serialized = serializeEventListRow(event);
        if (!serialized) {
          fastify.log.warn(
            { eventId: event.id },
            'Skipping event with invalid stored data',
          );
          continue;
        }
        serializedEvents.push(serialized);
      }

      return {
        data: serializedEvents,
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

      const serializedEvent = requireSerializedEventRow(event);
      const serializedChildren = children.flatMap((child) => {
        const serialized = serializeEventRow(child);
        if (serialized) return [serialized];
        fastify.log.warn(
          { eventId: child.id, parentEventId: event.id },
          'Skipping invalid child event',
        );
        return [];
      });
      return {
        ...serializedEvent,
        children: serializedChildren,
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
          '400': Http400BadRequestSchema,
        },
      },
    },
    async (request, reply) => {
      const {
        pet_id,
        caused_by,
        attributed_by,
        device_id,
        data,
        parent_event_id,
        timestamp: bodyTimestamp,
        human_verified: bodyHumanVerified,
        note,
      } = request.body;

      // Anything posted through the API is someone entering it by hand unless
      // they say otherwise — device paths write their own events directly.
      const attribution = attributionColumnsFromRequest({
        pet_id,
        caused_by,
        attributed_by,
        defaultSource: 'manual',
      });
      if (attribution === 'invalid') {
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'pet_id may only be set when caused_by is "pet"',
        });
      }

      let storedEventData: EventData = eventDataFromDto(data);
      let nutrients: Record<string, number> | undefined;

      if (
        storedEventData.type === 'food_intake' &&
        typeof storedEventData.food_id === 'number'
      ) {
        const food = await db
          .selectFrom('food')
          .selectAll()
          .where('id', '=', storedEventData.food_id)
          .executeTakeFirst();
        if (food && typeof storedEventData.amount === 'number') {
          nutrients = calculateNutrientsFromFood(storedEventData.amount, food);
          storedEventData = enrichFoodIntakeEventData(storedEventData, food);
        }
      }

      const eventTimestamp =
        bodyTimestamp != null ? new Date(bodyTimestamp) : new Date();
      const humanVerified =
        bodyHumanVerified ??
        (storedEventData.type === 'food_intake'
          ? true
          : storedEventData.type === 'pet_presence'
            ? storedEventData.context === 'manual'
            : false);

      // `pet_id` is required on POST, so the body always states a decision.
      const columns = attribution ?? attributionColumns('unknown', null, null);

      const result = await db
        .insertInto('event')
        .values({
          parent_event_id: parent_event_id || null,
          ...columns,
          device_id,
          timestamp: eventTimestamp,
          data: storedEventData,
          raw_data: null,
          human_verified: humanVerified,
          ...(note ? { note, note_updated_at: eventTimestamp } : {}),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      if (
        nutrients?.moisture_ml != null &&
        result.data.type === 'food_intake'
      ) {
        await db
          .insertInto('event')
          .values(
            buildMoistureChildEventValues({
              parentEventId: result.id,
              attribution: {
                pet_id: result.pet_id,
                caused_by: result.caused_by,
                attributed_by: result.attributed_by,
              },
              timestamp: result.timestamp,
              moistureMl: nutrients.moisture_ml,
            }),
          )
          .execute();
      }

      return requireSerializedEventRow(result);
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

      const existingData = parseStoredEventData(eventRow.data);
      if (existingData?.type !== 'litterbox_use') {
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Only litterbox_use events can be analyzed',
        });
      }
      const result = await computeLitterboxAnalysisData(db, {
        timestamp: eventRow.timestamp,
        raw_data: eventRow.raw_data,
        existing: existingData,
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

      return requireSerializedEventRow(updated);
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
        caused_by?: EventCauseDTO;
        attributed_by?: null;
        device_id?: null;
        parent_event_id?: null;
      } = {};

      if (existing.pet_id != null) {
        const ok = await db
          .selectFrom('pet')
          .select('id')
          .where('id', '=', existing.pet_id)
          .executeTakeFirst();
        // A deleted pet takes its attribution with it: the event drops back to
        // unresolved rather than to a non-pet cause, because a missing pet row
        // says nothing about what caused the event. Dropping `caused_by` to
        // 'unknown' alongside is required, not cosmetic — 'pet' with a null
        // `pet_id` would otherwise claim we still know an animal did it.
        if (!ok) {
          fkRepair.pet_id = null;
          fkRepair.caused_by = 'unknown';
          fkRepair.attributed_by = null;
        }
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
      if (body.pet_id !== undefined && body.pet_id !== null) {
        const p = body.pet_id;
        const validPetId = Number.isInteger(p) && p >= 1;
        if (validPetId) {
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

      // `pet_id` and `caused_by` are one decision; never spread them from the
      // body separately or a half-update can contradict itself. A PATCH is a
      // person editing an event, so a cause they settle here is `manual`.
      const attribution = attributionColumnsFromRequest({
        ...body,
        defaultSource: 'manual',
      });
      if (attribution === 'invalid') {
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'pet_id may only be set when caused_by is "pet"',
        });
      }

      const {
        data: patchEventData,
        human_verified,
        attributed_by,
        note,
      } = body;

      // A note and its timestamp move together: an empty string is the same
      // intent as null (the owner cleared it), and a cleared note must not
      // leave a "You · 10:02 AM" line behind with nothing above it.
      const noteUpdate =
        note === undefined
          ? undefined
          : note
            ? { note, note_updated_at: new Date() }
            : { note: null, note_updated_at: null };

      // `attributed_by` on its own restates how we know something the body is
      // not otherwise changing, so it applies without a full re-decision.
      const attributionUpdate =
        attribution ??
        (attributed_by !== undefined ? { attributed_by } : undefined);

      const result = await db
        .updateTable('event')
        .set({
          ...fkRepair,
          ...(human_verified !== undefined ? { human_verified } : {}),
          ...(attributionUpdate ?? {}),
          ...(patchEventData !== undefined
            ? { data: eventDataFromDto(patchEventData) }
            : {}),
          ...(noteUpdate ?? {}),
        })
        .where('id', '=', eventId)
        .returningAll()
        .executeTakeFirstOrThrow();

      return requireSerializedEventRow(result);
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
          .select([
            'media_link.media_id as media_id',
            'media.file_path as file_path',
          ])
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
        filesToUnlink.map((filePath) =>
          mediaManager.unlinkPersistedFile(filePath),
        ),
      );

      return { success: true };
    },
  );
};

export default eventRoutes;
