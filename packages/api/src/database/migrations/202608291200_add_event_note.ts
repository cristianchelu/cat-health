import { Kysely } from 'kysely';

/**
 * One free-text note per event.
 *
 * The event surface is otherwise read-only: every other field is something a
 * sensor measured or a matcher decided, and correcting those goes through the
 * fix form. A note is the one thing on the surface that is purely the owner's
 * — "litter changed this morning, heavier scoop than usual" — and it explains
 * a reading that would otherwise look like a symptom.
 *
 * One note, not a thread: this is a single-user app, so there is nobody to
 * reply to and no author to record. `note_updated_at` carries the "You ·
 * 10:02 AM" line; re-editing overwrites, and clearing the text drops both
 * columns back to null.
 *
 * A plain ADD COLUMN is safe here where `202608021200_add_event_attribution`
 * needed a rebuild: no CHECK constraint references these columns, so SQLite
 * has nothing to re-validate against the existing rows.
 */
export async function up(db: Kysely<Record<string, never>>): Promise<void> {
  await db.schema.alterTable('event').addColumn('note', 'text').execute();
  await db.schema
    .alterTable('event')
    .addColumn('note_updated_at', 'integer')
    .execute();
}

export async function down(db: Kysely<Record<string, never>>): Promise<void> {
  await db.schema.alterTable('event').dropColumn('note_updated_at').execute();
  await db.schema.alterTable('event').dropColumn('note').execute();
}
