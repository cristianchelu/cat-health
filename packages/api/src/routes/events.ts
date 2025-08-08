import { type Static, Type } from "@sinclair/typebox";
import { db } from "../database/index.ts";
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
    raw_data: Type.Optional(Type.Union([Type.Null(), Type.Array(Type.Number())])),
  }),
]);
export type PostEventDTO = Static<typeof PostEventSchema>;

const PatchEventSchema = Type.Object({
  data: Type.Optional(Type.Any()),
  human_verified: Type.Optional(Type.Boolean()),
});
export type PatchEventDTO = Static<typeof PatchEventSchema>;

export default function eventRoutes(fastify: FastifyTypeBox): void {
  fastify.get(
    "/",
    {
      schema: {
        querystring: Type.Object({
          pet_id: Type.Optional(Type.Number()),
          device_id: Type.Optional(Type.Number()),
        }),
        response: {
          "200": GetEventsSchema,
        },
      },
    },
    async (request) => {
      const { pet_id, device_id } = request.query;
      
      let query = db.selectFrom("event").selectAll();
      
      if (pet_id !== undefined) {
        query = query.where("pet_id", "=", pet_id);
      }
      
      if (device_id !== undefined) {
        query = query.where("device_id", "=", device_id);
      }
      
      const events = await query.execute();
      return events.map(event => ({
        ...event,
        raw_data: event.raw_data ? Array.from(event.raw_data) : null
      }));
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
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return {
        ...result,
        raw_data: result.raw_data ? Array.from(result.raw_data) : null
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
      const updateData = request.body;

      const result = await db
        .updateTable("event")
        .set(updateData)
        .where("id", "=", eventId)
        .returningAll()
        .executeTakeFirstOrThrow();

      return {
        ...result,
        raw_data: result.raw_data ? Array.from(result.raw_data) : null
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
