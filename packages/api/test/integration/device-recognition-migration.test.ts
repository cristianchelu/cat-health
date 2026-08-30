import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { sql, type Kysely } from 'kysely';

import { createDb, type Database } from '../../src/database/index.ts';
import { createMigrator } from '../../src/database/migrate.ts';
import * as attachmentMigration from '../../src/database/migrations/202608301200_device_recognition_attachment.ts';

/** Ids well clear of the internal accounts the device-architecture migration seeds. */
const ACCOUNT = { inference: 101, esphome: 102 } as const;

const DEVICE = {
  fountain: 201,
  litterbox: 202,
  camera: 203,
  /** Points at `fountain`, switched on. */
  recognizer: 301,
  /** Points at a device id that no longer exists. */
  dangling: 302,
  /** Also points at `fountain` — the pair that was never legal. */
  duplicate: 303,
  /** Points at `litterbox`, switched off. */
  disabled: 304,
  /** Config that is not JSON at all. */
  corrupt: 305,
  /** Valid JSON, but names no source. */
  sourceless: 306,
} as const;

/** Migration immediately before the recognition attachment. */
const PRE = '202608291200_add_event_note';
const ATTACHMENT = '202608301200_device_recognition_attachment';

/**
 * The attachment migration folds every `pet_recognizer` device into a row on
 * the device it watched, and `createTestDb` can never exercise that: it
 * migrates an empty database, so nothing passes through the fold.
 *
 * This migrates a throwaway database to the migration *before* it, seeds the
 * recognizer shapes a real install can hold — including the ones that have to
 * be dropped rather than migrated — and then applies it for real.
 */
describe('202608301200 device recognition attachment', () => {
  let tmpDir: string;
  let db: Kysely<Database>;

  /** Migrations are declared against an untyped schema; tests call them the same way. */
  const untyped = () => db as unknown as Kysely<Record<string, never>>;

  const seedDevice = (
    id: number,
    accountId: number,
    type: string,
    config: string,
    enabled = 1,
  ) =>
    sql`
      INSERT INTO device (id, provider_account_id, external_id, name, type, config, enabled, created_at, updated_at)
      VALUES (${id}, ${accountId}, ${`ext-${id}`}, ${`Device ${id}`}, ${type}, ${config}, ${enabled}, 1768132637000, 1768132637000)
    `.execute(db);

  const recognizerConfig = (
    sourceDeviceId: number | null,
    overrides: Record<string, unknown> = {},
  ) =>
    JSON.stringify({
      model: 'google/gemma-3-27b-it',
      ...(sourceDeviceId === null ? {} : { source_device_id: sourceDeviceId }),
      prompt_template: 'the hallway fountain',
      auto_identify: true,
      reference_images: { '1': [10, 11] },
      ...overrides,
    });

  /** The SerializePlugin may hand back either a parsed object or raw JSON text. */
  const asJson = (value: unknown): unknown =>
    typeof value === 'string' ? JSON.parse(value) : value;

  const readAttachment = async (deviceId: number) => {
    const { rows } = await sql<{
      device_id: number;
      account_id: number;
      config: unknown;
    }>`SELECT device_id, account_id, config FROM device_recognition WHERE device_id = ${deviceId}`.execute(
      db,
    );
    const row = rows[0];
    return row ? { ...row, config: asJson(row.config) } : undefined;
  };

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'cat-health-recognition-'));
    db = createDb(join(tmpDir, 'test.sqlite'));

    const { error } = await createMigrator(db).migrateTo(PRE);
    assert.equal(error, undefined);

    await sql`
      INSERT INTO provider_account (id, provider, name, config, runtime_state, enabled, internal, created_at, updated_at)
      VALUES (${ACCOUNT.inference}, 'inference', 'OpenRouter', '{"api_key":"k","base_url":"http://x"}', '{}', 1, 0, 1768132637000, 1768132637000)
    `.execute(db);
    await sql`
      INSERT INTO provider_account (id, provider, name, config, runtime_state, enabled, internal, created_at, updated_at)
      VALUES (${ACCOUNT.esphome}, 'esphome', 'Home LAN', '{}', '{}', 1, 0, 1768132637000, 1768132637000)
    `.execute(db);

    await seedDevice(
      DEVICE.fountain,
      ACCOUNT.esphome,
      'water_fountain',
      '{"host":"10.0.0.5"}',
    );
    await seedDevice(
      DEVICE.litterbox,
      ACCOUNT.esphome,
      'litterbox',
      '{"host":"10.0.0.6"}',
    );
    await seedDevice(DEVICE.camera, ACCOUNT.esphome, 'camera', '{}');

    await seedDevice(
      DEVICE.recognizer,
      ACCOUNT.inference,
      'pet_recognizer',
      recognizerConfig(DEVICE.fountain, { ignored_pets: [2] }),
    );
    await seedDevice(
      DEVICE.dangling,
      ACCOUNT.inference,
      'pet_recognizer',
      recognizerConfig(999999),
    );
    await seedDevice(
      DEVICE.duplicate,
      ACCOUNT.inference,
      'pet_recognizer',
      recognizerConfig(DEVICE.fountain, {
        prompt_template: 'the loser',
        reference_images: {},
      }),
    );
    await seedDevice(
      DEVICE.disabled,
      ACCOUNT.inference,
      'pet_recognizer',
      recognizerConfig(DEVICE.litterbox),
      0,
    );
    await seedDevice(
      DEVICE.corrupt,
      ACCOUNT.inference,
      'pet_recognizer',
      'not json at all',
    );
    await seedDevice(
      DEVICE.sourceless,
      ACCOUNT.inference,
      'pet_recognizer',
      recognizerConfig(null),
    );

    /* `event.device_id` has no ON DELETE action, so a recognizer's own
       connectivity log blocks the delete unless the migration clears it. Every
       real install has one: presence reports online the moment it connects. */
    await sql`
      INSERT INTO event (id, pet_id, caused_by, attributed_by, device_id, timestamp, data, human_verified)
      VALUES (9001, NULL, 'unknown', NULL, ${DEVICE.recognizer}, 1768132637000, '{"type":"device_connectivity","state":"online"}', 0)
    `.execute(db);

    const { error: migrateError } =
      await createMigrator(db).migrateTo(ATTACHMENT);
    assert.equal(
      migrateError,
      undefined,
      'the attachment migration must not throw',
    );
  });

  after(async () => {
    await db.destroy();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('hangs the recognizer config off the device it watched', async () => {
    assert.deepEqual(await readAttachment(DEVICE.fountain), {
      device_id: DEVICE.fountain,
      account_id: ACCOUNT.inference,
      config: {
        // The old device pinned a model string; migrated rows resolve the app
        // default at call time instead — but a model someone chose is kept.
        model: 'google/gemma-3-27b-it',
        prompt_template: 'the hallway fountain',
        auto_identify: true,
        reference_images: { '1': [10, 11] },
        ignored_pets: [2],
      },
    });
  });

  it('is first-wins when two recognizers claimed the same device', async () => {
    // The pair was never legal; the older row is the only stable answer.
    const attachment = await readAttachment(DEVICE.fountain);
    assert.equal(
      (attachment?.config as { prompt_template: string }).prompt_template,
      'the hallway fountain',
    );
  });

  it('folds a switched-off recognizer into auto_identify: false', async () => {
    // It never fired, so carrying its flag across verbatim would silently
    // switch identification on for a device whose owner had turned it off.
    assert.equal(
      (
        (await readAttachment(DEVICE.litterbox))?.config as {
          auto_identify: boolean;
        }
      ).auto_identify,
      false,
    );
  });

  it('drops recognizers with nothing to attach to', async () => {
    // A dangling, sourceless or unreadable recognizer was already inert: the
    // controller filtered on a source id it could never match.
    const { rows } = await sql<{
      count: number;
    }>`SELECT COUNT(*) AS count FROM device_recognition`.execute(db);
    assert.equal(rows[0].count, 2);
  });

  it('takes the recognizer connectivity log with it', async () => {
    const { rows } = await sql<{
      count: number;
    }>`SELECT COUNT(*) AS count FROM event WHERE id = 9001`.execute(db);
    assert.equal(rows[0].count, 0);
  });

  it('deletes the recognizer devices it replaced', async () => {
    const { rows } = await sql<{
      count: number;
    }>`SELECT COUNT(*) AS count FROM device WHERE type = 'pet_recognizer'`.execute(
      db,
    );
    assert.equal(rows[0].count, 0);

    // The watched devices themselves are untouched.
    const { rows: kept } = await sql<{
      count: number;
    }>`SELECT COUNT(*) AS count FROM device`.execute(db);
    assert.equal(kept[0].count, 3);
  });

  it('can be re-run after a partial failure', async () => {
    // No DDL transaction means a failure leaves the table created and only
    // some rows copied, so `up` has to be safe to run again.
    await attachmentMigration.up(untyped());
    await attachmentMigration.up(untyped());

    const { rows } = await sql<{
      count: number;
    }>`SELECT COUNT(*) AS count FROM device_recognition`.execute(db);
    assert.equal(rows[0].count, 2);
    assert.equal(
      (
        (await readAttachment(DEVICE.fountain))?.config as {
          prompt_template: string;
        }
      ).prompt_template,
      'the hallway fountain',
    );
  });

  it('drops the table on down, without resurrecting the old devices', async () => {
    const { error } = await createMigrator(db).migrateTo(PRE);
    assert.equal(error, undefined);

    const { rows } = await sql<{
      name: string;
    }>`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'device_recognition'`.execute(
      db,
    );
    assert.deepEqual(rows, [], 'down must drop the table');

    const { rows: recognizers } = await sql<{
      count: number;
    }>`SELECT COUNT(*) AS count FROM device WHERE type = 'pet_recognizer'`.execute(
      db,
    );
    assert.equal(
      recognizers[0].count,
      0,
      'the recognizer devices stay gone — their identity cannot be invented',
    );
  });
});
