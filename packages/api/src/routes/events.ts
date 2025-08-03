import { type Static, Type } from "@sinclair/typebox";
import { db } from "../database/index.ts";
import { type FastifyTypeBox } from "../types.ts";

const GetEventSchema = Type.Object({
  id: Type.Number(),
  pet_id: Type.Number(),
  device_id: Type.Union([Type.Null(), Type.Number()]),
  timestamp: Type.Any(), // TODO: Type.Date(),
  data: Type.Any(), // TODO: Type
});
export type GetEventDTO = Static<typeof GetEventSchema>;

const GetEventsSchema = Type.Array(GetEventSchema);
export type GetEventsDTO = Static<typeof GetEventsSchema>;

const PostEventSchema = Type.Composite([
  Type.Omit(GetEventSchema, ["id", "timestamp"]),
  Type.Object({
    timestamp: Type.Optional(Type.String()),
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
      return await db.selectFrom("event").selectAll().execute();
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
      return await db.selectFrom("event").selectAll().where("pet_id", "=", petId).execute();
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
      const { pet_id, device_id, timestamp, data } = request.body;

      const result = await db
        .insertInto("event")
        .values({
          pet_id,
          device_id,
          timestamp: timestamp ? new Date(timestamp) : new Date(),
          data,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return result;
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
