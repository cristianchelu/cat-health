import { Kysely, sql } from 'kysely';

/**
 * Allow pets without a known birth date (UI treats the field as optional).
 * SQLite in better-sqlite3 does not support ALTER COLUMN DROP NOT NULL, so rebuild.
 */
export async function up(db: Kysely<Record<string, never>>): Promise<void> {
  await sql`PRAGMA foreign_keys = OFF`.execute(db);

  try {
    await db.schema
      .createTable('pet_new')
      .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
      .addColumn('name', 'text', (col) => col.notNull().unique())
      .addColumn('breed', 'text', (col) => col.notNull())
      .addColumn('birth_date', 'text')
      .execute();

    await sql`
      INSERT INTO pet_new (id, name, breed, birth_date)
      SELECT id, name, breed, birth_date FROM pet
    `.execute(db);

    await db.schema.dropTable('pet').execute();
    await db.schema.alterTable('pet_new').renameTo('pet').execute();
  } finally {
    await sql`PRAGMA foreign_keys = ON`.execute(db);
  }
}

export async function down(db: Kysely<Record<string, never>>): Promise<void> {
  await sql`PRAGMA foreign_keys = OFF`.execute(db);

  try {
    await db.schema
      .createTable('pet_new')
      .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
      .addColumn('name', 'text', (col) => col.notNull().unique())
      .addColumn('breed', 'text', (col) => col.notNull())
      .addColumn('birth_date', 'text', (col) => col.notNull())
      .execute();

    await sql`
      INSERT INTO pet_new (id, name, breed, birth_date)
      SELECT id, name, breed, COALESCE(birth_date, '1970-01-01') FROM pet
    `.execute(db);

    await db.schema.dropTable('pet').execute();
    await db.schema.alterTable('pet_new').renameTo('pet').execute();
  } finally {
    await sql`PRAGMA foreign_keys = ON`.execute(db);
  }
}
