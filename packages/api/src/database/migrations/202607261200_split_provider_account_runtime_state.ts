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
 * (token validity is inferred by `tokenSeemsValid()` in SurePetClient, which
 * `SurePetAccountManager.ensureClient()` now actually goes through).
 *
 * A normal deploy is safe: main.ts migrates at startup, before any account
 * manager exists, so the old process is already gone by then.
 *
 * Do NOT run `npm run migrate` out-of-band against a live pre-split server.
 * Such a server holds its account config in memory and writes the whole blob
 * back on every token refresh or sync-cursor advance, so it will resurrect the
 * runtime keys inside `config` seconds after this migration strips them. If
 * that happens, re-run the final `json_remove` once the old process is down.
 *
 * ## Failure and re-run behaviour
 *
 * SQLite gets no DDL transaction (`supportsTransactionalDdl === false`), so a
 * failure part-way through leaves the column added and only some keys copied.
 * `up` is therefore idempotent: the column is only added when absent, the
 * copies are no-ops once `config` no longer holds the key, and `json_remove` of
 * an absent path is a no-op. Re-running after a partial failure finishes the
 * job.
 *
 * ## Known holes (deliberate)
 *
 * - A `config` that is not valid JSON is skipped entirely — there is nothing to
 *   extract from it and rewriting it would destroy the corrupt original, which
 *   is the only evidence of what went wrong. Such a row also loses its
 *   `runtime_state` on `down`, because there is no valid JSON document to merge
 *   it back into. In practice that state is always empty: an account whose
 *   `config` does not parse cannot construct an account manager (see
 *   `parseAccountConfig`), so nothing ever writes runtime state for it.
 * - A `sync` value that is not a JSON object (e.g. the string `"oops"`) is
 *   dropped rather than copied. It could never satisfy
 *   `SurePetSyncConfigSchema`, so the manager would discard it on read anyway;
 *   the cost is one full timeline re-sync, not data loss. Copying it blind is
 *   what used to make this migration hard-fail with `malformed JSON`.
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

async function hasRuntimeStateColumn(
  db: Kysely<Record<string, never>>,
): Promise<boolean> {
  const { rows } = await sql<{
    name: string;
  }>`SELECT name FROM pragma_table_info('provider_account')`.execute(db);
  return rows.some((row) => row.name === 'runtime_state');
}

export async function up(db: Kysely<Record<string, never>>): Promise<void> {
  if (!(await hasRuntimeStateColumn(db))) {
    await db.schema
      .alterTable('provider_account')
      .addColumn('runtime_state', 'jsonb', (col) =>
        col.notNull().defaultTo('{}'),
      )
      .execute();
  }

  // Copy each runtime key across, one at a time and only where it is actually
  // present, so absent keys stay absent rather than becoming explicit nulls.
  for (const { key, isObject } of RUNTIME_KEYS) {
    const extracted = `json_extract(config, '$.${key}')`;
    // Only re-wrap values that really are JSON objects. `json()` on anything
    // else (a bare string, a truncated blob) raises `malformed JSON` and, with
    // no transaction to roll back, aborts the migration half-done.
    const guard = isObject
      ? `json_type(config, '$.${key}') = 'object'`
      : `${extracted} IS NOT NULL`;

    await sql`
      UPDATE provider_account
      SET runtime_state = json_set(
        json(runtime_state),
        ${sql.raw(`'$.${key}'`)},
        ${sql.raw(isObject ? `json(${extracted})` : extracted)}
      )
      WHERE json_valid(config) AND ${sql.raw(guard)}
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
  if (!(await hasRuntimeStateColumn(db))) return;

  // Reunite the two blobs. json_patch merges runtime_state over config; the
  // keys are disjoint by construction, so nothing that `up` moved is lost.
  // Rows whose `config` is not valid JSON keep it verbatim and lose their
  // runtime state — see "Known holes" above.
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
