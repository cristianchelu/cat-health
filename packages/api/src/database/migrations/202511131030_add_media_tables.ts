import { Kysely, sql } from 'kysely';

/**
 * Media & Media Links migration.
 *
 * Tables introduced:
 * - media: stores generic media assets (images/videos/etc.).
 * - media_link: polymorphic join table allowing associating media with any entity
 *               (pet, device, event, service, etc.) via (entity_type, entity_id).
 *
 * Design notes:
 * - entity_id stored as text to allow heterogeneous PK types (integer UUID etc.).
 * - Indexes support efficient lookup in both directions.
 * - ON DELETE CASCADE from media_link.media_id -> media.id so links are cleaned when media removed.
 * - No FK from media_link.entity_id to target tables (keeps it generic / avoids circular migrations).
 */
export async function up(db: Kysely<Record<string, never>>): Promise<void> {
  // media table
  await db.schema
    .createTable('media')
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('created_at', 'integer', (col) =>
      col.notNull().defaultTo(sql`(strftime('%s','now'))`),
    )
    .addColumn('file_path', 'text', (col) => col.notNull())
    .addColumn('mime_type', 'text', (col) => col.notNull())
    .addColumn('file_size', 'integer', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('metadata', 'jsonb')
    .execute();

  await db.schema
    .createTable('media_link')
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('media_id', 'integer', (col) =>
      col.references('media.id').onDelete('cascade').notNull(),
    )
    .addColumn('entity_type', 'text', (col) => col.notNull())
    .addColumn('entity_id', 'text', (col) => col.notNull())
    .addColumn('created_at', 'integer', (col) =>
      col.notNull().defaultTo(sql`(strftime('%s','now'))`),
    )
    .addColumn('relation', 'text')
    .execute();

  await db.schema
    .createIndex('media_link_entity_idx')
    .on('media_link')
    .columns(['entity_type', 'entity_id'])
    .execute();

  await db.schema
    .createIndex('media_link_media_idx')
    .on('media_link')
    .column('media_id')
    .execute();
}

export async function down(db: Kysely<Record<string, never>>): Promise<void> {
  await db.schema.dropIndex('media_link_media_idx').execute();
  await db.schema.dropIndex('media_link_entity_idx').execute();
  await db.schema.dropTable('media_link').execute();
  await db.schema.dropTable('media').execute();
}
