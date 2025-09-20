import { db } from "../database/index.ts";
import { type FastifyTypeBox } from "../types.ts";
import { GetPetParamsSchema, GetPetResponseSchema, GetPetsResponseSchema, PostPetRequestSchema } from "@cat-health/shared";



export default function petRoutes(fastify: FastifyTypeBox): void {
  fastify.get(
    "/",
    {
      schema: {
        response: {
          "200": GetPetsResponseSchema,
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
        body: PostPetRequestSchema,
        response: {
          "200": GetPetResponseSchema,
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
  fastify.get(
    "/:id",
    {
      schema: {
        params: GetPetParamsSchema,
        response: {
          "200": GetPetResponseSchema,
        },
      },
    },
    async (request) => {
      const { id } = request.params as { id: number };
      const pet = await db.selectFrom("pet").selectAll().where("id", "=", id).executeTakeFirst();
      if (!pet) throw new Error("Pet not found");
      return pet;
    }
  );
}
