import { Kysely, sql } from 'kysely';

/**
 * Columns that let `event` hold declarations (a target set, a period started)
 * beside observations. `type` mirrors `data.type` so queries and partial
 * indexes name a column; `recorded_at` is when the row was written, apart from
 * `timestamp`, which is when it took effect; `timestamp_precision` says how
 * exact `timestamp` is, with null meaning exact.
 *
 * All three are plain ADD COLUMNs: a virtual column stores nothing, and
 * existing rows get nulls, which the CHECK on `timestamp_precision` accepts.
 * SQLite uses a partial index only for a query that repeats its condition, so
 * the two partial indexes move from the `json_extract` term to `type`.
 */
export async function up(db: Kysely<Record<string, never>>): Promise<void> {
  const columns = await eventColumns(db);

  if (!columns.has('type')) {
    await sql`
      ALTER TABLE event ADD COLUMN type TEXT
      GENERATED ALWAYS AS (json_extract(data, '$.type')) VIRTUAL
    `.execute(db);
  }
  if (!columns.has('recorded_at')) {
    await db.schema
      .alterTable('event')
      .addColumn('recorded_at', 'integer')
      .execute();
  }
  if (!columns.has('timestamp_precision')) {
    await db.schema
      .alterTable('event')
      .addColumn('timestamp_precision', 'text', (col) =>
        col.check(
          sql`timestamp_precision IN ('day', 'month', 'year', 'unknown')`,
        ),
      )
      .execute();
  }

  await sql`DROP INDEX IF EXISTS idx_event_pet_presence`.execute(db);
  await sql`DROP INDEX IF EXISTS idx_event_pet_weight`.execute(db);
  await sql`
    CREATE INDEX idx_event_pet_presence ON event (pet_id, timestamp)
    WHERE type = 'pet_presence'
  `.execute(db);
  await sql`
    CREATE INDEX idx_event_pet_weight ON event (pet_id, timestamp)
    WHERE type = 'weight_measurement'
  `.execute(db);
}

export async function down(db: Kysely<Record<string, never>>): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_event_pet_weight`.execute(db);
  await sql`DROP INDEX IF EXISTS idx_event_pet_presence`.execute(db);
  await sql`
    CREATE INDEX idx_event_pet_presence ON event (pet_id, timestamp)
    WHERE json_extract(data, '$.type') = 'pet_presence'
  `.execute(db);
  await sql`
    CREATE INDEX idx_event_pet_weight ON event (pet_id, timestamp)
    WHERE json_extract(data, '$.type') = 'weight_measurement'
  `.execute(db);

  await db.schema
    .alterTable('event')
    .dropColumn('timestamp_precision')
    .execute();
  await db.schema.alterTable('event').dropColumn('recorded_at').execute();
  await db.schema.alterTable('event').dropColumn('type').execute();
}

/** The columns `event` has now, generated ones included, so a half-applied `up` can be run again. */
async function eventColumns(
  db: Kysely<Record<string, never>>,
): Promise<Set<string>> {
  const { rows } = await sql<{
    name: string;
  }>`SELECT name FROM pragma_table_xinfo('event')`.execute(db);
  return new Set(rows.map((row) => row.name));
}
