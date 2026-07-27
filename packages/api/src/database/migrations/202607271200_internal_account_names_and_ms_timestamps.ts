import { Kysely, sql } from 'kysely';

/**
 * Two repairs to rows that already exist, both of which have to happen here
 * rather than in the migration that introduced them.
 *
 * ## 1. Internal account names
 *
 * `20251121_device_architecture` seeds one internal account per built-in
 * provider and named them "Camera Provider" / "ESPHome Provider". The UI now
 * shows the provider alongside the account name, so the suffix reads as a
 * stutter. Editing the original seed would only have worked on fresh installs:
 * `kysely_migration` already records it as applied and `FileMigrationProvider`
 * does no checksumming, so the edit would silently never run for anyone with an
 * existing database.
 *
 * The renames are guarded on the old value, so they are idempotent and leave a
 * user-chosen name alone.
 *
 * ## 2. Epoch-seconds timestamps
 *
 * `provider_account` and `device` declare `created_at` / `updated_at` as
 * integers and the API reads them as **milliseconds**
 * (`new Date(row.updated_at).toISOString()`). Two older code paths wrote
 * seconds instead: the `strftime('%s','now')` column defaults from
 * `20251121_device_architecture`, and a `Math.floor(Date.now() / 1000)` in the
 * account/device PATCH handlers (both now fixed). Rows written back then render
 * as January 1970.
 *
 * The fix is guarded on the value: anything below 1e12 cannot be a plausible
 * millisecond timestamp for this app (1e12 ms is September 2001), while every
 * seconds-era value is far below it. So `x < 1e12 → x * 1000` only ever touches
 * the broken rows and is safe to re-run.
 *
 * `device.last_seen` is left alone: it has only ever been written by
 * `DevicePresence` in milliseconds.
 *
 * `down` reverts the renames but **not** the timestamp repair — a correct row
 * and a repaired row are indistinguishable afterwards, so dividing back would
 * corrupt the rows that were always milliseconds.
 */

/** Below this, an "epoch millisecond" column is really epoch seconds. */
const MS_THRESHOLD = 1_000_000_000_000;

const SEED_RENAMES = [
  { provider: 'camera', from: 'Camera Provider', to: 'Camera' },
  { provider: 'esphome', from: 'ESPHome Provider', to: 'ESPHome' },
] as const;

const SECONDS_ERA_COLUMNS = [
  { table: 'provider_account', column: 'created_at' },
  { table: 'provider_account', column: 'updated_at' },
  { table: 'device', column: 'created_at' },
  { table: 'device', column: 'updated_at' },
] as const;

async function renameSeededAccounts(
  db: Kysely<Record<string, never>>,
  direction: 'up' | 'down',
): Promise<void> {
  for (const rename of SEED_RENAMES) {
    const from = direction === 'up' ? rename.from : rename.to;
    const to = direction === 'up' ? rename.to : rename.from;
    await sql`
      UPDATE provider_account
      SET name = ${to}
      WHERE provider = ${rename.provider}
        AND internal = 1
        AND name = ${from}
    `.execute(db);
  }
}

export async function up(db: Kysely<Record<string, never>>): Promise<void> {
  await renameSeededAccounts(db, 'up');

  for (const { table, column } of SECONDS_ERA_COLUMNS) {
    await sql`
      UPDATE ${sql.table(table)}
      SET ${sql.ref(column)} = ${sql.ref(column)} * 1000
      WHERE ${sql.ref(column)} IS NOT NULL AND ${sql.ref(column)} < ${MS_THRESHOLD}
    `.execute(db);
  }
}

export async function down(db: Kysely<Record<string, never>>): Promise<void> {
  await renameSeededAccounts(db, 'down');
}
