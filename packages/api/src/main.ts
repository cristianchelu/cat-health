import Fastify from 'fastify';
import { type TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import assert from 'node:assert';
import { config } from 'dotenv';
import fs from 'node:fs/promises';

config();

assert(process.env.RECORDING_PATH, 'RECORDING_PATH is not set in .env');

import { migrateToLatest } from './database/migrate.ts';
import { db } from './database/index.ts';
import { SyncService } from './services/sync/SyncService.ts';

import petRoutes from './routes/pets.ts';
import eventRoutes from './routes/events.ts';
import deviceRoutes from './routes/devices.ts';
import { FountainClient } from './services/ingest/FountainClient.ts';

const fastify = Fastify({
  logger: true,
  trustProxy: true,
}).withTypeProvider<TypeBoxTypeProvider>();

fastify.addHook('onRequest', (req, _reply, done) => {
  const ingressPath = req.headers['x-ingress-path'];
  if (
    typeof ingressPath === 'string' &&
    ingressPath !== '/' &&
    req.url?.startsWith(ingressPath)
  ) {
    req.raw.url = req.url.slice(ingressPath.length) || '/';
  }
  done();
});

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
        /^http:\/\/\d+\.\d+\.\d+\.\d+:5173$/, // Any IPv4 address on port 5173
        /^http:\/\/\[[\da-f:]+\]:5173$/i, // IPv6 addresses on port 5173
      ];

      const isAllowed = allowedPatterns.some((pattern) => pattern.test(origin));
      if (isAllowed) {
        return callback(null, true);
      }
    }

    // Production mode: Only allow specific frontend URL
    callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
});

// Serve video recordings statically
await fastify.register(fastifyStatic, {
  root: process.env.RECORDING_PATH,
  prefix: '/api/recordings/',
});

fastify.register(petRoutes, { prefix: '/api/pets' });
fastify.register(eventRoutes, { prefix: '/api/events' });
fastify.register(deviceRoutes, { prefix: '/api/devices' });

// Healthcheck endpoint
fastify.get('/api/healthcheck', async (request, reply) => {
  return reply.send({ status: 'ok' });
});

// Migration endpoint
fastify.post('/api/migrate', async (request, reply) => {
  try {
    const syncService = new SyncService(db);

    // Extract optional query parameters
    const query = request.query as any;
    const startDate = query.startDate ? new Date(query.startDate) : undefined;
    const endDate = query.endDate ? new Date(query.endDate) : undefined;
    // const migratorNames = query.migrators
    //   ? query.migrators.split(',').map((s: string) => s.trim())
    //   : undefined;

    console.log('Starting migration using SyncService...');
    if (startDate) console.log(`Start date: ${startDate.toISOString()}`);
    if (endDate) console.log(`End date: ${endDate.toISOString()}`);
    // if (migratorNames) console.log(`Migrators: ${migratorNames.join(', ')}`);

    await syncService.migrate(startDate, endDate /* , migratorNames */);

    await syncService.destroy();

    return reply.send({
      success: true,
      message: 'Migration completed successfully using SyncService',
    });
  } catch (error) {
    console.error('Migration failed:', error);
    return reply.status(500).send({
      success: false,
      message: 'Migration failed',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// Get available migrators
fastify.get('/api/migrate/migrators', async (request, reply) => {
  try {
    const syncService = new SyncService(db);
    const availableMigrators = syncService.getAvailableMigrators();

    await syncService.destroy();

    return reply.send({
      success: true,
      migrators: availableMigrators,
    });
  } catch (error) {
    console.error('Failed to get migrators:', error);
    return reply.status(500).send({
      success: false,
      message: 'Failed to get available migrators',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

const spaDistDir = path.resolve(import.meta.dirname, '../../ui/dist');
fastify.get('/', async (request, reply) => {
  // Prefer X-Ingress-Path (HA), fallback to X-Forwarded-Prefix if present
  const ingress =
    (request.headers['x-ingress-path'] as string | undefined) ||
    (request.headers['x-forwarded-prefix'] as string | undefined);

  if (ingress && ingress !== '/') {
    const html = injectBase(indexHtmlRaw, ingress);
    return reply.type('text/html; charset=utf-8').send(html);
  }

  // Normal mode (no ingress) -> serve the unmodified file
  return reply.sendFile('index.html', spaDistDir);
});
fastify.register(fastifyStatic, {
  root: spaDistDir,
  prefix: '/',
  decorateReply: false,
});

// Load the built index.html once
const indexHtmlPath = path.join(spaDistDir, 'index.html');
const indexHtmlRaw = await fs.readFile(indexHtmlPath, 'utf8');

function ensureSlashEnd(s: string) {
  return s.endsWith('/') ? s : s + '/';
}

function injectBase(html: string, baseHref: string) {
  const href = ensureSlashEnd(baseHref).replace(/"/g, '&quot;');
  return html.replace(
    '<base href="/" />',
    `<base href="${href}"><script>window.baseUrl = "${href}";</script>`,
  );
}

fastify.setNotFoundHandler((request, reply) => {
  // Only fallback for GET requests not starting with /api or /api/recordings
  const url = request.raw.url || '';
  const isSpaRoute =
    request.raw.method === 'GET' &&
    !url.startsWith('/api') &&
    !url.startsWith('/api/recordings');

  if (!isSpaRoute) {
    return reply.status(404).send({ error: 'Not Found' });
  }

  // Prefer X-Ingress-Path (HA), fallback to X-Forwarded-Prefix if present
  const ingress =
    (request.headers['x-ingress-path'] as string | undefined) ||
    (request.headers['x-forwarded-prefix'] as string | undefined);

  if (ingress && ingress !== '/') {
    const html = injectBase(indexHtmlRaw, ingress);
    return reply.type('text/html; charset=utf-8').send(html);
  }

  // Normal mode (no ingress) -> serve the unmodified file
  return reply.sendFile('index.html', spaDistDir);
});

// Register ingest services
if (process.env.FOUNTAIN_HOST) {
  const fountainIngest = new FountainClient({
    host: process.env.FOUNTAIN_HOST,
    snapshotUrl: process.env.FOUNTAIN_CAMERA_SNAPSHOT_URL,
    snapshotAuth: process.env.FOUNTAIN_CAMERA_SNAPSHOT_AUTH,
    encryptionKey: process.env.FOUNTAIN_PSK,
  });
  fountainIngest.connect();
}

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
