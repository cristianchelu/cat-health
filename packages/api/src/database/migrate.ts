import path from 'path';
import { promises as fs } from 'fs';
import { Kysely, Migrator, FileMigrationProvider } from 'kysely';
import { fileURLToPath } from 'url';

import { createDb, type Database } from './index.ts';

export function createMigrator(db: Kysely<Database>) {
  const dir = path.dirname(fileURLToPath(import.meta.url));

  return new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.resolve(dir, 'migrations'),
    }),
  });
}

/**
 * Applies every pending migration and **throws** if any of them fails.
 *
 * It deliberately does not auto-revert. Kysely's SQLite adapter reports
 * `supportsTransactionalDdl === false`, so a failed migration is left
 * half-applied — but `migrateDown()` would then revert the *previous*,
 * successfully applied migration, and a `down` may be lossy by design (e.g.
 * `202607201200_pet_birth_date_nullable` rebuilds `pet` with
 * `COALESCE(birth_date, '1970-01-01')`, stamping a fake birth date on every
 * pet that had none). Cascading a revert through unrelated tables to "clean up"
 * an unrelated failure destroys far more than it saves, and the next boot
 * re-applies and re-fails in a loop.
 *
 * So: fail loudly, leave the database as it is, and let a human look at it.
 * Every `up` is written to be safe to re-run after a partial failure.
 */
export async function migrateToLatest(db: Kysely<Database>) {
  const migrator = createMigrator(db);

  const { error, results } = await migrator.migrateToLatest();

  results?.forEach((it) => {
    if (it.status === 'Success') {
      console.log(`migration "${it.migrationName}" was executed successfully`);
    } else if (it.status === 'Error') {
      console.error(`failed to execute migration "${it.migrationName}"`);
    }
  });

  if (error) {
    console.error(
      'failed to migrate; the database was left untouched (no automatic revert)',
    );
    throw error instanceof Error ? error : new Error(String(error));
  }
}

export async function migrateDown(db: Kysely<Database>) {
  const migrator = createMigrator(db);

  const { error, results } = await migrator.migrateDown();

  results?.forEach((it) => {
    if (it.status === 'Success') {
      console.log(`migration "${it.migrationName}" was reverted successfully`);
    } else if (it.status === 'Error') {
      console.error(`failed to revert migration "${it.migrationName}"`);
    }
  });

  if (error) {
    console.error('failed to revert migration');
    throw error instanceof Error ? error : new Error(String(error));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const db = createDb();
  try {
    if (process.argv.includes('--down')) {
      await migrateDown(db);
    } else {
      await migrateToLatest(db);
    }
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
}
