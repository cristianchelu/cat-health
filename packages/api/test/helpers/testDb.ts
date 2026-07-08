import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';

import { buildApp, type BuildAppOptions } from '../../src/app.ts';
import { createDb, type Database } from '../../src/database/index.ts';
import { migrateToLatest } from '../../src/database/migrate.ts';

export interface TestDbContext {
  db: Kysely<Database>;
  dbPath: string;
  tmpDir: string;
}

export async function createTestDb(): Promise<TestDbContext> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'cat-health-test-'));
  const dbPath = join(tmpDir, 'test.sqlite');
  const db = createDb(dbPath);
  await migrateToLatest(db);
  return { db, dbPath, tmpDir };
}

export async function destroyTestDb(ctx: TestDbContext): Promise<void> {
  await ctx.db.destroy();
  await rm(ctx.tmpDir, { recursive: true, force: true });
}

export type CreateTestAppOptions = Omit<BuildAppOptions, 'db'>;

export async function createTestApp(
  ctx: TestDbContext,
  options: CreateTestAppOptions = {},
): Promise<FastifyInstance> {
  return buildApp({
    db: ctx.db,
    logger: false,
    ...options,
  });
}
