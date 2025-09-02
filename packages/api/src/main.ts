import Fastify from "fastify";
import { type TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { config } from "dotenv";

// Load environment variables
config();

import { migrateToLatest } from "./database/migrate.ts";
import { db } from "./database/index.ts";
import { SyncService } from "./services/sync/SyncService.ts";

import petRoutes from "./routes/pets.ts";
import eventRoutes from "./routes/events.ts";
import deviceRoutes from "./routes/devices.ts";

const fastify = Fastify({
  logger: true,
}).withTypeProvider<TypeBoxTypeProvider>();

await fastify.register(cors, {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Check for environment-specific frontend URL first
    const frontendUrl = process.env.FRONTEND_URL;
    if (frontendUrl && frontendUrl !== '*') {
      if (origin === frontendUrl) {
        return callback(null, true);
      }
    }
    
    // Development mode: Allow any localhost/127.0.0.1 and any IP on port 5173
    if (process.env.NODE_ENV !== 'production') {
      const allowedPatterns = [
        /^http:\/\/localhost:5173$/,
        /^http:\/\/127\.0\.0\.1:5173$/,
        /^http:\/\/\d+\.\d+\.\d+\.\d+:5173$/,  // Any IPv4 address on port 5173
        /^http:\/\/\[[\da-f:]+\]:5173$/i,       // IPv6 addresses on port 5173
      ];
      
      const isAllowed = allowedPatterns.some(pattern => pattern.test(origin));
      if (isAllowed) {
        return callback(null, true);
      }
    }
    
    // Production mode: Only allow specific frontend URL
    callback(null, false);
  },
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
    const syncService = new SyncService(db);
    
    // Extract optional query parameters
    const query = request.query as any;
    const startDate = query.startDate ? new Date(query.startDate) : undefined;
    const endDate = query.endDate ? new Date(query.endDate) : undefined;
    const migratorNames = query.migrators ? query.migrators.split(',').map((s: string) => s.trim()) : undefined;
    
    console.log("Starting migration using SyncService...");
    if (startDate) console.log(`Start date: ${startDate.toISOString()}`);
    if (endDate) console.log(`End date: ${endDate.toISOString()}`);
    if (migratorNames) console.log(`Migrators: ${migratorNames.join(', ')}`);
    
    await syncService.migrate(startDate, endDate, migratorNames);
    
    await syncService.destroy();
    
    return reply.send({ 
      success: true, 
      message: "Migration completed successfully using SyncService" 
    });
  } catch (error) {
    console.error("Migration failed:", error);
    return reply.status(500).send({ 
      success: false, 
      message: "Migration failed", 
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Get available migrators
fastify.get("/migrate/migrators", async (request, reply) => {
  try {
    const syncService = new SyncService(db);
    const availableMigrators = syncService.getAvailableMigrators();
    
    await syncService.destroy();
    
    return reply.send({ 
      success: true, 
      migrators: availableMigrators 
    });
  } catch (error) {
    console.error("Failed to get migrators:", error);
    return reply.status(500).send({ 
      success: false, 
      message: "Failed to get available migrators", 
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

const start = async () => {
  try {
    await migrateToLatest();
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
