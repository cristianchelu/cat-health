import Fastify from "fastify";
import { type TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import cors from "@fastify/cors";

import { migrateToLatest } from "./database/migrate.ts";

import petRoutes from "./routes/pets.ts";
import eventRoutes from "./routes/events.ts";

const fastify = Fastify({
  logger: true,
}).withTypeProvider<TypeBoxTypeProvider>();

await fastify.register(cors, {
  origin: "http://localhost:5173",
});

fastify.register(petRoutes, { prefix: "/pets" });
fastify.register(eventRoutes, { prefix: "/events" });

const start = async () => {
  try {
    await migrateToLatest();
    await fastify.listen({ port: 3000 });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
