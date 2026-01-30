import { Kysely, sql } from 'kysely';

/**
 * Food table and sub-events (parent_event_id) migration.
 *
 * - Adds parent_event_id to event for linked events (e.g. food_intake -> water_intake moisture).
 * - Creates food table for food definitions with nutritional data.
 */
export async function up(db: Kysely<Record<string, never>>): Promise<void> {
  await db.schema
    .alterTable('event')
    .addColumn('parent_event_id', 'integer', (col) =>
      col.references('event.id').onDelete('cascade'),
    )
    .execute();

  await db.schema
    .createIndex('idx_event_parent')
    .on('event')
    .column('parent_event_id')
    .execute();

  await db.schema
    .createTable('food')
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('brand', 'text')
    .addColumn('food_type', 'text', (col) => col.notNull())
    .addColumn('moisture_percent', 'real')
    .addColumn('calories_per_100g', 'real')
    .addColumn('nutrients', 'jsonb')
    .addColumn('serving_size_g', 'real')
    .addColumn('notes', 'text')
    .addColumn('created_at', 'integer', (col) =>
      col.notNull().defaultTo(sql`(strftime('%s','now'))`),
    )
    .addColumn('updated_at', 'integer', (col) =>
      col.notNull().defaultTo(sql`(strftime('%s','now'))`),
    )
    .execute();
}

export async function down(db: Kysely<Record<string, never>>): Promise<void> {
  await db.schema.dropTable('food').execute();
  await db.schema.dropIndex('idx_event_parent').on('event').execute();
  await db.schema.alterTable('event').dropColumn('parent_event_id').execute();
}
