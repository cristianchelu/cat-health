import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { sql, type Kysely } from 'kysely';

import { createDb, type Database } from '../../src/database/index.ts';
import { createMigrator } from '../../src/database/migrate.ts';
import * as splitMigration from '../../src/database/migrations/202607261200_split_provider_account_runtime_state.ts';

/**
 * Ids well clear of the internal accounts that `20251121_device_architecture`
 * seeds (1-3).
 */
const ACCOUNT = {
  full: 101,
  brokenCursor: 102,
  corrupt: 103,
  plain: 104,
} as const;

/** Migration immediately before the config/runtime_state split. */
const PRE_SPLIT = '202607201200_pet_birth_date_nullable';
const SPLIT = '202607261200_split_provider_account_runtime_state';

/**
 * The split migration backfills `runtime_state` out of pre-split `config`
 * blobs, and `createTestDb` can never exercise that: it migrates an empty
 * database, so nothing ever passes through the backfill.
 *
 * These tests migrate a throwaway database to the migration *before* the split,
 * seed the row shapes a real install can hold — including the ones that used to
 * abort the migration half-way — and then apply it for real.
 */
describe('202607261200 provider_account config/runtime_state split', () => {
  let tmpDir: string;
  let db: Kysely<Database>;

  /** Migrations are declared against an untyped schema; tests call them the same way. */
  const untyped = () => db as unknown as Kysely<Record<string, never>>;

  const seed = (id: number, provider: string, name: string, config: string) =>
    sql`
    INSERT INTO provider_account (id, provider, name, config, enabled, internal, created_at, updated_at)
    VALUES (${id}, ${provider}, ${name}, ${config}, 1, 0, 1768132637, 1768132637)
  `.execute(db);

  /** Column-at-a-time: `runtime_state` does not exist in the pre-split schema. */
  const readColumn = async (
    id: number,
    column: 'config' | 'runtime_state',
  ): Promise<unknown> => {
    const { rows } = await sql<{
      value: unknown;
    }>`SELECT ${sql.ref(column)} AS value FROM provider_account WHERE id = ${id}`.execute(
      db,
    );
    const row = rows[0];
    assert.ok(row, `account ${id} vanished`);
    return row.value;
  };

  /** The SerializePlugin may hand back either a parsed object or raw JSON text. */
  const asJson = (value: unknown): unknown =>
    typeof value === 'string' ? JSON.parse(value) : value;

  const readConfig = async (id: number) =>
    asJson(await readColumn(id, 'config'));
  const readRuntime = async (id: number) =>
    asJson(await readColumn(id, 'runtime_state'));

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'cat-health-migration-'));
    db = createDb(join(tmpDir, 'test.sqlite'));

    const { error } = await createMigrator(db).migrateTo(PRE_SPLIT);
    assert.equal(error, undefined);

    // A fully populated pre-split blob: user settings and runtime state mixed.
    await seed(
      ACCOUNT.full,
      'surepet',
      'Casa Whiskers',
      JSON.stringify({
        email: 'you@example.com',
        password: 'pw',
        pet_links: [{ external_pet_id: '1', pet_id: 7 }],
        device_id: 'install-uuid',
        token: 'jwt',
        household_id: 42,
        sync: { last_timeline_since_id: 55 },
        token_expires_at: '2026-07-01T00:00:00Z',
      }),
    );

    // `sync` holding a bare string: `json(json_extract(...))` on this raised
    // `malformed JSON` and, with no DDL transaction, aborted the migration.
    await seed(
      ACCOUNT.brokenCursor,
      'surepet',
      'Broken cursor',
      JSON.stringify({ email: 'a', password: 'b', sync: 'oops' }),
    );

    // Not JSON at all. Nothing to extract; the original must survive verbatim.
    await seed(ACCOUNT.corrupt, 'esphome', 'Corrupt', 'not json at all');

    // A provider with no runtime state whatsoever.
    await seed(
      ACCOUNT.plain,
      'esphome',
      'Home LAN',
      JSON.stringify({ host: '10.0.0.5' }),
    );

    const { error: splitError } = await createMigrator(db).migrateTo(SPLIT);
    assert.equal(splitError, undefined, 'the split migration must not throw');
  });

  after(async () => {
    await db.destroy();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('moves runtime keys out of config, keeping objects as objects', async () => {
    assert.deepEqual(await readConfig(ACCOUNT.full), {
      email: 'you@example.com',
      password: 'pw',
      pet_links: [{ external_pet_id: '1', pet_id: 7 }],
    });
    assert.deepEqual(await readRuntime(ACCOUNT.full), {
      device_id: 'install-uuid',
      token: 'jwt',
      household_id: 42,
      sync: { last_timeline_since_id: 55 },
    });
  });

  it('drops a non-object sync instead of failing the whole migration', async () => {
    assert.deepEqual(await readConfig(ACCOUNT.brokenCursor), {
      email: 'a',
      password: 'b',
    });
    assert.deepEqual(
      await readRuntime(ACCOUNT.brokenCursor),
      {},
      'an unparseable cursor is dropped, not copied',
    );
  });

  it('leaves a config that is not valid JSON verbatim', async () => {
    assert.equal(
      await readColumn(ACCOUNT.corrupt, 'config'),
      'not json at all',
    );
    assert.deepEqual(await readRuntime(ACCOUNT.corrupt), {});
  });

  it('gives providers without runtime state an empty blob', async () => {
    assert.deepEqual(await readConfig(ACCOUNT.plain), { host: '10.0.0.5' });
    assert.deepEqual(await readRuntime(ACCOUNT.plain), {});
  });

  it('can be re-run after a partial failure', async () => {
    // No DDL transaction means a failure leaves the column added and only some
    // keys copied, so `up` has to be safe to run again.
    await splitMigration.up(untyped());
    await splitMigration.up(untyped());

    assert.deepEqual(await readRuntime(ACCOUNT.full), {
      device_id: 'install-uuid',
      token: 'jwt',
      household_id: 42,
      sync: { last_timeline_since_id: 55 },
    });
    assert.deepEqual(await readConfig(ACCOUNT.full), {
      email: 'you@example.com',
      password: 'pw',
      pet_links: [{ external_pet_id: '1', pet_id: 7 }],
    });
  });

  it('survives an up → down → up round trip', async () => {
    const { error: downError } = await createMigrator(db).migrateTo(PRE_SPLIT);
    assert.equal(downError, undefined);

    const columns = await sql<{
      name: string;
    }>`SELECT name FROM pragma_table_info('provider_account')`.execute(db);
    assert.ok(
      !columns.rows.some((c) => c.name === 'runtime_state'),
      'down must drop the column',
    );

    // Reunited into one blob, minus the keys `up` deliberately discards.
    assert.deepEqual(await readConfig(ACCOUNT.full), {
      email: 'you@example.com',
      password: 'pw',
      pet_links: [{ external_pet_id: '1', pet_id: 7 }],
      device_id: 'install-uuid',
      token: 'jwt',
      household_id: 42,
      sync: { last_timeline_since_id: 55 },
    });
    assert.equal(
      await readColumn(ACCOUNT.corrupt, 'config'),
      'not json at all',
    );

    const { error: upError } = await createMigrator(db).migrateTo(SPLIT);
    assert.equal(upError, undefined);

    assert.deepEqual(await readRuntime(ACCOUNT.full), {
      device_id: 'install-uuid',
      token: 'jwt',
      household_id: 42,
      sync: { last_timeline_since_id: 55 },
    });
    assert.deepEqual(await readConfig(ACCOUNT.full), {
      email: 'you@example.com',
      password: 'pw',
      pet_links: [{ external_pet_id: '1', pet_id: 7 }],
    });
  });

  it('repairs seconds-era timestamps and the seeded internal account names', async () => {
    const { error } = await createMigrator(db).migrateToLatest();
    assert.equal(error, undefined);

    const { rows } = await sql<{
      id: number;
      name: string;
      created_at: number;
      updated_at: number;
    }>`SELECT id, name, created_at, updated_at FROM provider_account ORDER BY id`.execute(
      db,
    );

    for (const row of rows) {
      assert.ok(
        row.created_at > 1_000_000_000_000,
        `account ${row.id} created_at is still epoch seconds`,
      );
      assert.ok(
        row.updated_at > 1_000_000_000_000,
        `account ${row.id} updated_at is still epoch seconds`,
      );
    }

    // The internal accounts seeded by 20251121_device_architecture.
    const byName = new Map(rows.map((r) => [r.name, r]));
    assert.ok(byName.has('Camera'), 'Camera Provider was not renamed');
    assert.ok(byName.has('ESPHome'), 'ESPHome Provider was not renamed');

    // Idempotent: applying it twice must not double-multiply or re-rename.
    const before = rows;
    await sql`DELETE FROM kysely_migration WHERE name = '202607271200_internal_account_names_and_ms_timestamps'`.execute(
      db,
    );
    const { error: again } = await createMigrator(db).migrateToLatest();
    assert.equal(again, undefined);

    const { rows: after } = await sql<{
      id: number;
      name: string;
      created_at: number;
      updated_at: number;
    }>`SELECT id, name, created_at, updated_at FROM provider_account ORDER BY id`.execute(
      db,
    );
    assert.deepEqual(after, before);
  });
});
