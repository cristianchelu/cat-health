import { Kysely, sql } from 'kysely';

/**
 * Say what caused an event, and on what basis.
 *
 * `event.pet_id IS NULL` has always carried two meanings at once — "a pet, we
 * don't know which" and "no pet was involved at all" — so a fountain event the
 * robot vacuum triggered was indistinguishable from one the recognizer merely
 * failed on, and kept coming back for manual review.
 *
 * ## `caused_by`
 *
 * Names what did cause the event rather than what didn't. `unknown` is the
 * unresolved state and the one the review queue selects on; `pet` means an
 * animal of ours, with `pet_id` naming which (or staying null when we know it
 * was a pet but not which one); every other value resolves the event without a
 * pet. No sentinel `pet_id` is possible here — `pet_id` is `REFERENCES pet(id)`
 * and better-sqlite3 enforces foreign keys, so an id with no row is rejected.
 *
 * ## `attributed_by`
 *
 * How that conclusion was reached — an RFID chip is not a guess, a weight
 * plateau is. This is the axis `human_verified` half-covers today; `manual`
 * states that a human decided the attribution, without conflating it with "a
 * human edited some other field". Left null for history: `human_verified`
 * cannot be back-translated, since provider imports and food enrichment set it
 * too, and reading it as `manual` would assert a person decided things they
 * never saw.
 *
 * ## Why the CHECK does not list values
 *
 * Only one rule is permanently true: nothing can point at a pet while claiming
 * something else caused it. The CHECK enforces exactly that. Both vocabularies
 * live in TypeBox (`EventCauseSchema`, `EventAttributionSourceSchema`) and are
 * validated at the API boundary, so adding `ambiguous`, `multiple_pets` or a new
 * source is a literal and a switch case — never another migration, which is what
 * enumerating them in DDL would have cost.
 *
 * ## Why a rebuild rather than ALTER TABLE ADD COLUMN
 *
 * SQLite validates a newly added CHECK against the rows already in the table.
 * Every existing row with a `pet_id` would take the `'unknown'` default and
 * break the constraint on the spot, so the column cannot be added and then
 * backfilled. Rebuilding lets the copy assign the right cause per row in the
 * same pass, so the table never exists in a state the constraint forbids.
 * `PRAGMA foreign_keys = OFF` around it is required: `event.parent_event_id`
 * points back at `event`, and dropping the old table would cascade.
 */

/** Kept in sync by hand: the shape of `event` as this migration leaves it. */
async function createEventTable(
  db: Kysely<Record<string, never>>,
  name: string,
  withAttribution: boolean,
): Promise<void> {
  let table = db.schema
    .createTable(name)
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('pet_id', 'integer', (col) =>
      col.references('pet.id').onDelete('cascade'),
    );

  if (withAttribution) {
    table = table
      .addColumn('caused_by', 'text', (col) =>
        col.notNull().defaultTo('unknown'),
      )
      .addColumn('attributed_by', 'text');
  }

  table = table
    .addColumn('device_id', 'integer', (col) => col.references('device.id'))
    .addColumn('timestamp', 'integer', (col) => col.notNull())
    .addColumn('data', 'jsonb', (col) => col.notNull())
    .addColumn('raw_data', 'blob')
    .addColumn('human_verified', 'boolean', (col) =>
      col.notNull().defaultTo(false),
    )
    .addColumn('parent_event_id', 'integer', (col) =>
      col.references('event.id').onDelete('cascade'),
    );

  if (withAttribution) {
    table = table.addCheckConstraint(
      'event_pet_id_requires_pet_cause',
      sql`pet_id IS NULL OR caused_by = 'pet'`,
    );
  }

  await table.execute();
}

export async function up(db: Kysely<Record<string, never>>): Promise<void> {
  await sql`PRAGMA foreign_keys = OFF`.execute(db);

  try {
    await createEventTable(db, 'event_new', true);

    // A pet reference is itself the claim that a pet caused the event; anything
    // else has not been decided yet. Assigning it here rather than in a follow-up
    // UPDATE is what keeps every row constraint-clean from the moment it lands.
    await sql`
      INSERT INTO event_new (
        id, pet_id, caused_by, attributed_by, device_id,
        timestamp, data, raw_data, human_verified, parent_event_id
      )
      SELECT
        id,
        pet_id,
        CASE WHEN pet_id IS NOT NULL THEN 'pet' ELSE 'unknown' END,
        NULL,
        device_id,
        timestamp,
        data,
        raw_data,
        human_verified,
        parent_event_id
      FROM event
    `.execute(db);

    await db.schema.dropTable('event').execute();
    await db.schema.alterTable('event_new').renameTo('event').execute();
    await db.schema
      .createIndex('idx_event_parent')
      .on('event')
      .column('parent_event_id')
      .execute();
  } finally {
    await sql`PRAGMA foreign_keys = ON`.execute(db);
  }
}

export async function down(db: Kysely<Record<string, never>>): Promise<void> {
  await sql`PRAGMA foreign_keys = OFF`.execute(db);

  try {
    await createEventTable(db, 'event_new', false);

    await sql`
      INSERT INTO event_new (
        id, pet_id, device_id, timestamp, data,
        raw_data, human_verified, parent_event_id
      )
      SELECT
        id, pet_id, device_id, timestamp, data,
        raw_data, human_verified, parent_event_id
      FROM event
    `.execute(db);

    await db.schema.dropTable('event').execute();
    await db.schema.alterTable('event_new').renameTo('event').execute();
    await db.schema
      .createIndex('idx_event_parent')
      .on('event')
      .column('parent_event_id')
      .execute();
  } finally {
    await sql`PRAGMA foreign_keys = ON`.execute(db);
  }
}
