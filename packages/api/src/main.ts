import Fastify from "fastify";
import { type TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import path from "node:path";

import { migrateToLatest } from "./database/migrate.ts";

import petRoutes from "./routes/pets.ts";
import eventRoutes from "./routes/events.ts";
import deviceRoutes from "./routes/devices.ts";
import { spawn } from "child_process";

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

// Migration endpoint
fastify.post("/migrate", async (request, reply) => {
  try {
    const scriptPath = path.resolve(import.meta.dirname, "./scripts/migrate.ts");
    
    return new Promise((resolve, reject) => {
      const migrationProcess = spawn("npx", ["tsx", scriptPath], {
        stdio: ["pipe", "pipe", "pipe"],
        cwd: path.dirname(scriptPath),
      });

      let stdout = "";
      let stderr = "";

      migrationProcess.stdout.on("data", (data) => {
        stdout += data.toString();
        console.log(data.toString());
      });

      migrationProcess.stderr.on("data", (data) => {
        stderr += data.toString();
        console.error(data.toString());
      });

      migrationProcess.on("close", (code) => {
        if (code === 0) {
          resolve(reply.send({ success: true, message: "Migration completed successfully" }));
        } else {
          reject(new Error(`Migration failed with exit code ${code}: ${stderr}`));
        }
      });

      migrationProcess.on("error", (error) => {
        console.error('Failed to start migration process:', error);
        reject(error);
      });
    });
  } catch (error) {
    reply.status(500).send({ 
      success: false, 
      message: "Failed to start migration", 
      error: error.message 
    });
  }
});

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
