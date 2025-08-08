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

export default function eventRoutes(fastify: FastifyTypeBox): void {
  fastify.get(
    "/",
    {
      schema: {
        response: {
          "200": GetEventsSchema,
        },
      },
    },
    async () => {
      const events = await db.selectFrom("event").selectAll().execute();
      return events.map(event => ({
        ...event,
        raw_data: event.raw_data ? Array.from(event.raw_data) : null
      }));
    }
  );

  fastify.get(
    "/:petId",
    {
      schema: {
        params: Type.Object({ petId: Type.Number() }),
        response: {
          "200": GetEventsSchema,
        },
      },
    },
    async (request) => {
      const { petId } = request.params;
      const events = await db.selectFrom("event").selectAll().where("pet_id", "=", petId).execute();
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
