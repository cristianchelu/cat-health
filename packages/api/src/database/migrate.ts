import path from 'path';
import { promises as fs } from 'fs';
import { Kysely, Migrator, FileMigrationProvider } from 'kysely';
import { dialect, type Database } from './index.ts';
import { fileURLToPath } from 'url';

// TODO: Transform to fastify plugin?
export async function migrateToLatest(closeConnection = false) {
  const database = new Kysely<Database>({
    dialect,
  });

  const dir = path.dirname(fileURLToPath(import.meta.url));

  const migrator = new Migrator({
    db: database,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.resolve(dir, 'migrations'),
    }),
  });

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

  if (closeConnection) {
    await database.destroy();
  }
}

export async function migrateDown(closeConnection = false) {
  const database = new Kysely<Database>({
    dialect,
  });

  const dir = path.dirname(fileURLToPath(import.meta.url));

  const migrator = new Migrator({
    db: database,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.resolve(dir, 'migrations'),
    }),
  });

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

  if (closeConnection) {
    await database.destroy();
  }
}

// Run migration if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--down')) {
    migrateDown(true);
  } else {
    migrateToLatest(true);
  }
}
