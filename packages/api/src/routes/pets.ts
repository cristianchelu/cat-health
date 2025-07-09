import { Type } from "@sinclair/typebox";

import { db } from "../database/index.ts";
import { type FastifyTypeBox } from "../types.ts";

const GetPetSchema = Type.Object({
  id: Type.Number(),
  name: Type.String(),
  breed: Type.String(),
  birth_date: Type.Any(), //TODO: Type.Date()
});
const GetPetsSchema = Type.Array(GetPetSchema);
const PostPetSchema = Type.Omit(GetPetSchema, ["id"]);

export default function petRoutes(fastify: FastifyTypeBox): void {
  fastify.get(
    "/",
    {
      schema: {
        response: {
          "200": GetPetsSchema,
        },
      },
    },
    async () => {
      return await db.selectFrom("pet").selectAll().execute();
    }
  );

  fastify.post(
    "/",
    {
      schema: {
        body: PostPetSchema,
        response: {
          "200": GetPetSchema,
        },
      },
    },
    async (request) => {
      const { name, breed, birth_date } = request.body;

      const result = await db
        .insertInto("pet")
        .values({ name, breed, birth_date })
        .returningAll()
        .executeTakeFirstOrThrow();

      return result;
    }
  );
}
