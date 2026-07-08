import path from 'path';
import { promises as fs } from 'fs';
import { Kysely, Migrator, FileMigrationProvider } from 'kysely';
import { fileURLToPath } from 'url';

import { createDb, type Database } from './index.ts';

function createMigrator(db: Kysely<Database>) {
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
    console.error('failed to migrate');
    console.error(error);
    await migrator.migrateDown();
    process.exit(1);
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
    console.error(error);
    process.exit(1);
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
  } finally {
    await db.destroy();
  }
}
