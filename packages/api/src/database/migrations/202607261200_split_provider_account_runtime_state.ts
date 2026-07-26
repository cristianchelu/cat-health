import { Kysely, sql } from 'kysely';

/**
 * Splits `provider_account.config` into two columns:
 *
 * - `config`        — user-supplied settings, editable from the UI and validated
 *                     at the API boundary.
 * - `runtime_state` — provider-managed state (auth tokens, cached remote ids,
 *                     sync cursors), written only by account managers.
 *
 * Before this, a single blob held both, which meant the UI had to round-trip
 * secrets through a JSON textarea to avoid destroying them, and a background
 * token refresh could silently revert a concurrent user edit.
 *
 * SurePet is the only provider with runtime state today. `token_expires_at` is
 * dropped rather than moved: it is declared in the schema but read nowhere
 * (token validity is inferred by `tokenSeemsValid()` in SurePetClient).
 *
 * A normal deploy is safe: main.ts migrates at startup, before any account
 * manager exists, so the old process is already gone by then.
 *
 * Do NOT run `npm run migrate` out-of-band against a live pre-split server.
 * Such a server holds its account config in memory and writes the whole blob
 * back on every token refresh or sync-cursor advance, so it will resurrect the
 * runtime keys inside `config` seconds after this migration strips them. If
 * that happens, re-run the final `json_remove` once the old process is down.
 */

/**
 * Runtime keys that lived in `config` before the split. `sync` is an object, so
 * its extracted value must be re-wrapped with `json()` — `json_extract` returns
 * objects as JSON *text*, which would otherwise land as an escaped string.
 */
const RUNTIME_KEYS = [
  { key: 'device_id', isObject: false },
  { key: 'token', isObject: false },
  { key: 'household_id', isObject: false },
  { key: 'sync', isObject: true },
] as const;

/** Dropped entirely — declared in the schema but read nowhere. */
const DEAD_KEYS = ['token_expires_at'] as const;

export async function up(db: Kysely<Record<string, never>>): Promise<void> {
  await db.schema
    .alterTable('provider_account')
    .addColumn('runtime_state', 'jsonb', (col) => col.notNull().defaultTo('{}'))
    .execute();

  // Copy each runtime key across, one at a time and only where it is actually
  // present, so absent keys stay absent rather than becoming explicit nulls.
  for (const { key, isObject } of RUNTIME_KEYS) {
    const extracted = `json_extract(config, '$.${key}')`;
    await sql`
      UPDATE provider_account
      SET runtime_state = json_set(
        json(runtime_state),
        ${sql.raw(`'$.${key}'`)},
        ${sql.raw(isObject ? `json(${extracted})` : extracted)}
      )
      WHERE json_valid(config) AND ${sql.raw(extracted)} IS NOT NULL
    `.execute(db);
  }

  await sql`
    UPDATE provider_account
    SET config = json_remove(config, ${sql.raw(
      [...RUNTIME_KEYS.map((r) => r.key), ...DEAD_KEYS]
        .map((k) => `'$.${k}'`)
        .join(', '),
    )})
    WHERE json_valid(config)
  `.execute(db);
}

export async function down(db: Kysely<Record<string, never>>): Promise<void> {
  // Reunite the two blobs. json_patch merges runtime_state over config;
  // the keys are disjoint by construction, so nothing is lost.
  await sql`
    UPDATE provider_account
    SET config = json_patch(config, runtime_state)
    WHERE json_valid(config) AND json_valid(runtime_state)
  `.execute(db);

  await db.schema
    .alterTable('provider_account')
    .dropColumn('runtime_state')
    .execute();
}
