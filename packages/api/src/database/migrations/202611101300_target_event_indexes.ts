import { Kysely, sql } from 'kysely';

/**
 * Partial indexes for the two target events. A pet has a handful of each, so
 * "the targets in effect on a day" is a seek, and a list of what happened can
 * leave declarations out by id without parsing a single payload.
 */
export async function up(db: Kysely<Record<string, never>>): Promise<void> {
  await sql`
    CREATE INDEX IF NOT EXISTS idx_event_intake_target
    ON event (pet_id, timestamp) WHERE type = 'intake_target'
  `.execute(db);
  await sql`
    CREATE INDEX IF NOT EXISTS idx_event_weight_target
    ON event (pet_id, timestamp) WHERE type = 'weight_target'
  `.execute(db);
}

export async function down(db: Kysely<Record<string, never>>): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_event_weight_target`.execute(db);
  await sql`DROP INDEX IF EXISTS idx_event_intake_target`.execute(db);
}
