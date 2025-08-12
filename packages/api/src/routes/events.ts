import { type Static, Type } from "@sinclair/typebox";
import { db } from "../database/index.ts";
import { sql } from "kysely";
import { type FastifyTypeBox } from "../types.ts";

const GetEventSchema = Type.Object({
  id: Type.Number(),
  pet_id: Type.Union([Type.Number(), Type.Null()]),
  device_id: Type.Union([Type.Null(), Type.Number()]),
  timestamp: Type.Any(), // TODO: Type.Date(),
  data: Type.Any(), // TODO: Type
  raw_data: Type.Union([Type.Null(), Type.Array(Type.Number())]),
  human_verified: Type.Boolean(),
});
export type GetEventDTO = Static<typeof GetEventSchema>;

const GetEventsSchema = Type.Array(GetEventSchema);
export type GetEventsDTO = Static<typeof GetEventsSchema>;

const PostEventSchema = Type.Composite([
  Type.Omit(GetEventSchema, ["id", "timestamp", "raw_data"]),
  Type.Object({
    timestamp: Type.Optional(Type.String()),
    raw_data: Type.Optional(
      Type.Union([Type.Null(), Type.Array(Type.Number())])
    ),
  }),
]);
export type PostEventDTO = Static<typeof PostEventSchema>;

const PatchEventSchema = Type.Object({
  pet_id: Type.Union([Type.Number(), Type.Null()]),
  data: Type.Optional(Type.Any()),
  human_verified: Type.Optional(Type.Boolean()),
});
export type PatchEventDTO = Static<typeof PatchEventSchema>;

const WeightTrendSchema = Type.Object({
  date: Type.String(),
  weight: Type.Number(),
  timestamp: Type.String(),
});

const WeightTrendsSchema = Type.Array(WeightTrendSchema);
export type WeightTrendDTO = Static<typeof WeightTrendSchema>;
export type WeightTrendsDTO = Static<typeof WeightTrendsSchema>;

export default function eventRoutes(fastify: FastifyTypeBox): void {
  fastify.get(
    "/weight-trends/:petId",
    {
      schema: {
        params: Type.Object({ petId: Type.Number() }),
        querystring: Type.Object({
          days: Type.Optional(Type.Number({ minimum: 1 })),
        }),
        response: {
          "200": WeightTrendsSchema,
        },
      },
    },
    async (request) => {
      const { petId } = request.params;
      const { days = 30 } = request.query;

      let query = db
        .selectFrom("event")
        .selectAll()
        .where("pet_id", "=", petId)
        .where(sql`json_extract(data, '$.type')`, "=", "weight_measurement")
        .orderBy("timestamp", "asc");

      // Only apply date filter if days is reasonable (not "all time")
      if (days < 9999) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        query = query.where("timestamp", ">=", startDate);
      }

      const weightEvents = await query.execute();

      const trends: WeightTrendDTO[] = weightEvents.map((event) => {
        const data = event.data as { type: string; weight: number };
        return {
          date: event.timestamp.toISOString().split('T')[0],
          weight: data.weight,
          timestamp: event.timestamp.toISOString(),
        };
      });

      return trends;
    }
  );

  fastify.get(
    "/",
    {
      schema: {
        querystring: Type.Object({
          pet_id: Type.Optional(Type.Number()),
          device_id: Type.Optional(Type.Number()),
          startTime: Type.Optional(Type.String({ format: 'date-time' })), // ISO 8601 format
          endTime: Type.Optional(Type.String({ format: 'date-time' })), // ISO 8601 format
          limit: Type.Optional(Type.Number({ minimum: 1, maximum: 5000 })),
          offset: Type.Optional(Type.Number({ minimum: 0 })),
        }),
        response: {
          "200": Type.Object({
            events: GetEventsSchema,
            total: Type.Number(),
            limit: Type.Number(),
            offset: Type.Number(),
            hasMore: Type.Boolean(),
          }),
        },
      },
    },
    async (request) => {
      const { pet_id, device_id, startTime, endTime, limit = 100, offset = 0 } = request.query;

      let query = db.selectFrom("event").selectAll();
      let countQuery = db.selectFrom("event").select(db.fn.count<number>('id').as('count'));

      if (pet_id !== undefined) {
        query = query.where("pet_id", "=", pet_id);
        countQuery = countQuery.where("pet_id", "=", pet_id);
      }

      if (device_id !== undefined) {
        query = query.where("device_id", "=", device_id);
        countQuery = countQuery.where("device_id", "=", device_id);
      }

      if (startTime !== undefined) {
        const start = new Date(startTime);
        query = query.where("timestamp", ">=", start);
        countQuery = countQuery.where("timestamp", ">=", start);
      }

      if (endTime !== undefined) {
        const end = new Date(endTime);
        query = query.where("timestamp", "<=", end);
        countQuery = countQuery.where("timestamp", "<=", end);
      }

      // Order by timestamp descending (newest first)
      query = query.orderBy("timestamp", "desc");

      // Apply pagination
      query = query.limit(limit).offset(offset);

      const [events, countResult] = await Promise.all([
        query.execute(),
        countQuery.executeTakeFirst()
      ]);

      const total = countResult?.count || 0;
      const hasMore = offset + events.length < total;

      return {
        events: events.map((event) => ({
          ...event,
          raw_data: event.raw_data ? Array.from(event.raw_data) : null,
        })),
        total,
        limit,
        offset,
        hasMore,
      };
    }
  );

  fastify.post(
    "/",
    {
      schema: {
        body: PostEventSchema,
        response: {
          "200": GetEventSchema,
        },
      },
    },
    async (request) => {
      const { pet_id, device_id, timestamp, data, raw_data } = request.body;

      const result = await db
        .insertInto("event")
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
    }
  );

  fastify.patch(
    "/:eventId",
    {
      schema: {
        params: Type.Object({ eventId: Type.Number() }),
        body: PatchEventSchema,
        response: {
          "200": GetEventSchema,
        },
      },
    },
    async (request) => {
      const { eventId } = request.params;
      const { body } = request;

      const result = await db
        .updateTable("event")
        .set({
          ...body,
          pet_id: body.pet_id === 0 ? null : body.pet_id,
        })
        .where("id", "=", eventId)
        .returningAll()
        .executeTakeFirstOrThrow();

      return {
        ...result,
        raw_data: result.raw_data ? Array.from(result.raw_data) : null,
      };
    }
  );

  fastify.delete(
    "/:eventId",
    {
      schema: {
        params: Type.Object({ eventId: Type.Number() }),
        response: {
          "200": Type.Object({ success: Type.Boolean() }),
        },
      },
    },
    async (request) => {
      const { eventId } = request.params;

      await db
        .deleteFrom("event")
        .where("id", "=", eventId)
        .executeTakeFirstOrThrow();

      return { success: true };
    }
  );
}
