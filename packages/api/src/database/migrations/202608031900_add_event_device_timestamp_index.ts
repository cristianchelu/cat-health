import { Kysely } from 'kysely';

/**
 * Index `event(device_id, timestamp)`.
 *
 * The event table carried only `idx_event_parent`, so every per-device lookup
 * over a time window was a full table scan. That is the access pattern behind
 * the device timeline, litterbox analytics, and the deposit counter on the
 * devices grid, and the table is the largest in the database.
 *
 * Leading with `device_id` serves both equality on one device and the
 * `device_id IN (…) AND timestamp >= …` range the devices list issues once per
 * page load.
 */
export async function up(db: Kysely<Record<string, never>>): Promise<void> {
  await db.schema
    .createIndex('idx_event_device_timestamp')
    .on('event')
    .columns(['device_id', 'timestamp'])
    .execute();
}

export async function down(db: Kysely<Record<string, never>>): Promise<void> {
  await db.schema.dropIndex('idx_event_device_timestamp').execute();
}
