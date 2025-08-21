import Fastify from "fastify";
import { type TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import path from "node:path";

import { migrateToLatest } from "./database/migrate.ts";

import petRoutes from "./routes/pets.ts";
import eventRoutes from "./routes/events.ts";
import deviceRoutes from "./routes/devices.ts";

const fastify = Fastify({
  logger: true,
}).withTypeProvider<TypeBoxTypeProvider>();

await fastify.register(cors, {
  origin: "http://localhost:5173",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
});

// Serve video recordings statically
const recordingsDir = path.resolve(import.meta.dirname, "../data/recordings");
await fastify.register(fastifyStatic, {
  root: recordingsDir,
  prefix: "/recordings/",
});

fastify.register(petRoutes, { prefix: "/pets" });
fastify.register(eventRoutes, { prefix: "/events" });
fastify.register(deviceRoutes, { prefix: "/devices" });

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
