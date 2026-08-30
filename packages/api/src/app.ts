import path from 'node:path';
import fs from 'node:fs/promises';

import Fastify, { type FastifyInstance } from 'fastify';
import { type TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import type { Kysely } from 'kysely';

import type { Database } from './database/index.ts';
import { getMediaPath } from './mediaPaths.ts';
import petRoutes from './routes/pets.ts';
import eventRoutes from './routes/events.ts';
import deviceRoutes from './routes/devices.ts';
import foodRoutes from './routes/foods.ts';
import settingsRoutes from './routes/settings.ts';
import type { DeviceIntegrationContext } from './services/devices/types.ts';
import type { RecognitionService } from './services/recognition/RecognitionService.ts';

declare module 'fastify' {
  interface FastifyInstance {
    db: Kysely<Database>;
    integrationManager: DeviceIntegrationContext;
    recognitionService: RecognitionService;
  }
}

export interface BuildAppOptions {
  db: Kysely<Database>;
  integrationManager?: DeviceIntegrationContext;
  recognitionService?: RecognitionService;
  logger?: boolean;
}

function getCorsAllowedOrigins(): Set<string> {
  const raw = process.env.CORS_ALLOWED_ORIGINS;
  if (!raw?.trim()) return new Set();
  const set = new Set<string>();
  for (const part of raw.split(',')) {
    const origin = part.trim();
    if (origin) set.add(origin);
  }
  return set;
}

export async function buildApp({
  db,
  integrationManager,
  recognitionService,
  logger = true,
}: BuildAppOptions) {
  const fastify = Fastify({
    logger,
    trustProxy: true,
  }).withTypeProvider<TypeBoxTypeProvider>();

  fastify.decorate('db', db);
  if (integrationManager) {
    fastify.decorate('integrationManager', integrationManager);
  }
  if (recognitionService) {
    fastify.decorate('recognitionService', recognitionService);
  }

  const corsAllowedOrigins = getCorsAllowedOrigins();

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
      if (!origin) return callback(null, true);

      if (corsAllowedOrigins.has(origin)) {
        return callback(null, true);
      }

      if (process.env.NODE_ENV !== 'production') {
        const allowedPatterns = [
          /^http:\/\/localhost:5173$/,
          /^http:\/\/127\.0\.0\.1:5173$/,
          /^http:\/\/\d+\.\d+\.\d+\.\d+:5173$/,
          /^http:\/\/\[[\da-f:]+\]:5173$/i,
        ];

        const isAllowed = allowedPatterns.some((pattern) =>
          pattern.test(origin),
        );
        if (isAllowed) {
          return callback(null, true);
        }
      }

      callback(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await fastify.register(multipart, {
    limits: {
      fileSize: 2_000_000,
      files: 1,
    },
  });

  await fastify.register(fastifyStatic, {
    root: getMediaPath(),
    prefix: '/api/media/',
  });

  fastify.get('/api/healthcheck', async (_request, reply) => {
    return reply.send({ status: 'ok' });
  });

  await fastify.register(petRoutes, { prefix: '/api/pets' });
  await fastify.register(eventRoutes, { prefix: '/api/events' });
  await fastify.register(deviceRoutes, { prefix: '/api/devices' });
  await fastify.register(foodRoutes, { prefix: '/api/foods' });
  await fastify.register(settingsRoutes, { prefix: '/api/settings' });

  return fastify;
}

export function ensureSlashEnd(s: string) {
  return s.endsWith('/') ? s : s + '/';
}

export function injectBase(html: string, baseHref: string) {
  const href = ensureSlashEnd(baseHref).replace(/"/g, '&quot;');
  return html.replace(
    '<base href="/" />',
    `<base href="${href}"><script>window.baseUrl = "${href}";</script>`,
  );
}

export async function registerProductionSpa(fastify: FastifyInstance) {
  const spaDistDir = path.resolve(import.meta.dirname, '../../ui/dist');
  const indexHtmlPath = path.join(spaDistDir, 'index.html');
  const indexHtmlRaw = await fs.readFile(indexHtmlPath, 'utf8');

  fastify.get('/', async (request, reply) => {
    const ingress =
      (request.headers['x-ingress-path'] as string | undefined) ||
      (request.headers['x-forwarded-prefix'] as string | undefined);

    if (ingress && ingress !== '/') {
      const html = injectBase(indexHtmlRaw, ingress);
      return reply.type('text/html; charset=utf-8').send(html);
    }

    return reply.sendFile('index.html', spaDistDir);
  });

  await fastify.register(fastifyStatic, {
    root: spaDistDir,
    prefix: '/',
    decorateReply: false,
    setHeaders(reply, filePath) {
      if (filePath.endsWith('/sw.js')) {
        reply.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    },
  });

  fastify.setNotFoundHandler((request, reply) => {
    const url = request.raw.url || '';
    const isSpaRoute =
      request.raw.method === 'GET' &&
      !url.startsWith('/api') &&
      !url.startsWith('/api/recordings') &&
      !url.startsWith('/api/images');

    if (!isSpaRoute) {
      return reply.status(404).send({ error: 'Not Found' });
    }

    const ingress =
      (request.headers['x-ingress-path'] as string | undefined) ||
      (request.headers['x-forwarded-prefix'] as string | undefined);

    if (ingress && ingress !== '/') {
      const html = injectBase(indexHtmlRaw, ingress);
      return reply.type('text/html; charset=utf-8').send(html);
    }

    return reply.sendFile('index.html', spaDistDir);
  });
}
