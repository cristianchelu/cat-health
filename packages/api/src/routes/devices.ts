import { Type } from "@sinclair/typebox";

import { db } from "../database/index.ts";
import { type FastifyTypeBox } from "../types.ts";

const GetDeviceSchema = Type.Object({
  id: Type.Number(),
  name: Type.String(),
  type: Type.Union([Type.Literal("litterbox"), Type.Literal("feeder"), Type.Literal("water_fountain")]),
});
const GetDevicesSchema = Type.Array(GetDeviceSchema);
const PostDeviceSchema = Type.Omit(GetDeviceSchema, ["id"]);

export default function deviceRoutes(fastify: FastifyTypeBox): void {
  fastify.get(
    "/",
    {
      schema: {
        response: {
          "200": GetDevicesSchema,
        },
      },
    },
    async () => {
      return await db.selectFrom("device").selectAll().execute();
    }
  );

  fastify.post(
    "/",
    {
      schema: {
        body: PostDeviceSchema,
        response: {
          "200": GetDeviceSchema,
        },
      },
    },
    async (request) => {
      const { name, type } = request.body;

      const result = await db
        .insertInto("device")
        .values({ name, type })
        .returningAll()
        .executeTakeFirstOrThrow();

      return result;
    }
  );
  fastify.get(
    "/:id",
    {
      schema: {
        params: Type.Object({ id: Type.Number() }),
        response: {
          "200": GetDeviceSchema,
        },
      },
    },
    async (request) => {
      const { id } = request.params as { id: number };
      const device = await db.selectFrom("device").selectAll().where("id", "=", id).executeTakeFirst();
      if (!device) throw new Error("Device not found");
      return device;
    }
  );
}