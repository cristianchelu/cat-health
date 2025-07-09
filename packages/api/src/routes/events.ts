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
      const events = await db.selectFrom("event").selectAll().execute();
      return events;
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
}
