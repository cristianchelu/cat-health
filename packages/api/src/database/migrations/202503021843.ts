import { Kysely } from 'kysely';

export async function up(db: Kysely<Record<string, never>>): Promise<void> {
  await db.schema
    .createTable('pet')
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('name', 'text', (col) => col.notNull().unique())
    .addColumn('breed', 'text', (col) => col.notNull())
    .addColumn('birth_date', 'text', (col) => col.notNull())
    .execute();

  await db.schema
    .createTable('device')
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('type', 'text', (col) => col.notNull())
    .execute();

  await db.schema
    .createTable('event')
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('pet_id', 'integer', (col) =>
      col.references('pet.id').onDelete('cascade'),
    )
    .addColumn('device_id', 'integer', (col) => col.references('device.id'))
    .addColumn('timestamp', 'integer', (col) => col.notNull())
    .addColumn('data', 'jsonb', (col) => col.notNull())
    .addColumn('raw_data', 'blob')
    .addColumn('human_verified', 'boolean', (col) =>
      col.notNull().defaultTo(false),
    )
    .execute();
}

export async function down(db: Kysely<Record<string, never>>): Promise<void> {
  await db.schema.dropTable('event').execute();
  await db.schema.dropTable('device').execute();
  await db.schema.dropTable('pet').execute();
}
