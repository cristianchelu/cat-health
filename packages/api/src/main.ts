import { config } from 'dotenv';

config();

import path from 'node:path';
import assert from 'node:assert';
import fs from 'node:fs/promises';

import Fastify from 'fastify';
import { type TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';

const isDev = process.env.NODE_ENV !== 'production';

assert(process.env.MEDIA_PATH, 'MEDIA_PATH is not set in .env');

// Ensure required directories exist
await fs.mkdir(process.env.MEDIA_PATH, { recursive: true });
if (process.env.MEDIA_TEMP_PATH) {
  await fs.mkdir(process.env.MEDIA_TEMP_PATH, { recursive: true });
}

import { migrateToLatest } from './database/migrate.ts';
import { db } from './database/index.ts';

import petRoutes from './routes/pets.ts';
import eventRoutes from './routes/events.ts';
import deviceRoutes from './routes/devices.ts';
import foodRoutes from './routes/foods.ts';

import { EventBus } from './services/devices/EventBus.ts';
import { IntegrationManager } from './services/devices/IntegrationManager.ts';
import { ESPHomeProvider } from './services/devices/providers/esphome/ESPHomeProvider.ts';
import { CameraProvider } from './services/devices/providers/camera/CameraProvider.ts';
import { InferenceProvider } from './services/devices/providers/inference/InferenceProvider.ts';

declare module 'fastify' {
  interface FastifyInstance {
    integrationManager: IntegrationManager;
  }
}

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

// Multipart (file upload) support – 2MB avatar limit
await fastify.register(multipart, {
  limits: {
    fileSize: 2_000_000, // 2MB max
    files: 1,
  },
});

// Serve video recordings & snapshots statically
await fastify.register(fastifyStatic, {
  root: process.env.MEDIA_PATH,
  prefix: '/api/media/',
});

// Healthcheck endpoint
fastify.get('/api/healthcheck', async (request, reply) => {
  return reply.send({ status: 'ok' });
});

// SPA serving - only in production (in dev, use Vite's dev server on port 5173)
let indexHtmlRaw: string | undefined;

if (!isDev) {
  const spaDistDir = path.resolve(import.meta.dirname, '../../ui/dist');

  // Load the built index.html once
  const indexHtmlPath = path.join(spaDistDir, 'index.html');
  indexHtmlRaw = await fs.readFile(indexHtmlPath, 'utf8');

  fastify.get('/', async (request, reply) => {
    // Prefer X-Ingress-Path (HA), fallback to X-Forwarded-Prefix if present
    const ingress =
      (request.headers['x-ingress-path'] as string | undefined) ||
      (request.headers['x-forwarded-prefix'] as string | undefined);

    if (ingress && ingress !== '/') {
      const html = injectBase(indexHtmlRaw!, ingress);
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

  fastify.setNotFoundHandler((request, reply) => {
    // Only fallback for GET requests not starting with /api or /api/recordings
    const url = request.raw.url || '';
    const isSpaRoute =
      request.raw.method === 'GET' &&
      !url.startsWith('/api') &&
      !url.startsWith('/api/recordings') &&
      !url.startsWith('/api/images');

    if (!isSpaRoute) {
      return reply.status(404).send({ error: 'Not Found' });
    }

    // Prefer X-Ingress-Path (HA), fallback to X-Forwarded-Prefix if present
    const ingress =
      (request.headers['x-ingress-path'] as string | undefined) ||
      (request.headers['x-forwarded-prefix'] as string | undefined);

    if (ingress && ingress !== '/') {
      const html = injectBase(indexHtmlRaw!, ingress);
      return reply.type('text/html; charset=utf-8').send(html);
    }

    // Normal mode (no ingress) -> serve the unmodified file
    return reply.sendFile('index.html', spaDistDir);
  });
}

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

const start = async () => {
  try {
    await migrateToLatest();

    // Initialize Device System
    const eventBus = new EventBus();
    const integrationManager = new IntegrationManager(db, eventBus);

    // Register Providers
    integrationManager.registerProvider(new ESPHomeProvider());
    integrationManager.registerProvider(new CameraProvider());
    integrationManager.registerProvider(new InferenceProvider());

    // Start Integration Manager (loads accounts and devices)
    await integrationManager.initialize();

    fastify.decorate('integrationManager', integrationManager);

    fastify.register(petRoutes, { prefix: '/api/pets' });
    fastify.register(eventRoutes, { prefix: '/api/events' });
    fastify.register(deviceRoutes, { prefix: '/api/devices' });
    fastify.register(foodRoutes, { prefix: '/api/foods' });

    await fastify.listen({ port: 3000, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
