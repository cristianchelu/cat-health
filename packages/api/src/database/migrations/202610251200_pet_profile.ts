import { Kysely, sql } from 'kysely';

/**
 * Pet profile fields, and partial indexes for the two per-pet "latest event of
 * a type" lookups: current presence and the litterbox weight roster.
 *
 * Presence and weight rows are a sliver of `event`, and neither lookup had an
 * index to seek on, so each one read every event of the pets it asked about.
 * Queries must repeat the index's `json_extract(data, '$.type') = …` term for
 * SQLite to pick it.
 */
export async function up(db: Kysely<Record<string, never>>): Promise<void> {
  await db.schema.alterTable('pet').addColumn('microchip', 'text').execute();
  await db.schema
    .alterTable('pet')
    .addColumn('sex', 'text', (col) =>
      col
        .notNull()
        .defaultTo('unknown')
        .check(sql`sex IN ('female', 'male', 'unknown')`),
    )
    .execute();
  await db.schema
    .alterTable('pet')
    .addColumn('altered', 'text', (col) =>
      col
        .notNull()
        .defaultTo('unknown')
        .check(sql`altered IN ('altered', 'intact', 'unknown')`),
    )
    .execute();

  await sql`
    CREATE INDEX idx_event_pet_presence ON event (pet_id, timestamp)
    WHERE json_extract(data, '$.type') = 'pet_presence'
  `.execute(db);
  await sql`
    CREATE INDEX idx_event_pet_weight ON event (pet_id, timestamp)
    WHERE json_extract(data, '$.type') = 'weight_measurement'
  `.execute(db);
}

export async function down(db: Kysely<Record<string, never>>): Promise<void> {
  await db.schema.dropIndex('idx_event_pet_weight').execute();
  await db.schema.dropIndex('idx_event_pet_presence').execute();
  await db.schema.alterTable('pet').dropColumn('altered').execute();
  await db.schema.alterTable('pet').dropColumn('sex').execute();
  await db.schema.alterTable('pet').dropColumn('microchip').execute();
}
