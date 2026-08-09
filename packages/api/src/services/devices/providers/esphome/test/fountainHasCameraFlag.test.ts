import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { sql, type Kysely } from 'kysely';
import type { Entity as EspHomeEntity } from 'esphome-client';

import { createDb, type Database } from '../../../../../database/index.ts';
import { FountainController } from '../FountainController.ts';
import type { ESPHomeConfig } from '../BaseESPHomeController.ts';
import type { Device, ProviderDeps } from '../../../types.ts';

const DEVICE_ID = 7;

/** Backdoor into the controller internals the tests exercise. */
interface ControllerAccess {
  config: ESPHomeConfig;
  persistHasCameraFlag(): Promise<void>;
  onEntitiesReceived(entities: EspHomeEntity[]): void;
}

const access = (controller: FountainController) =>
  controller as unknown as ControllerAccess;

function makeController(
  db: Kysely<Database>,
  config: Record<string, unknown>,
): FountainController {
  const device = {
    id: DEVICE_ID,
    name: 'Fountain',
    type: 'water_fountain',
    config,
  } as unknown as Device;
  return new FountainController(device, { db } as unknown as ProviderDeps);
}

const cameraEntity = {
  key: 1,
  type: 'camera',
  name: 'Camera',
  objectId: 'camera',
} as unknown as EspHomeEntity;

async function readConfig(db: Kysely<Database>): Promise<unknown> {
  const row = await db
    .selectFrom('device')
    .select('config')
    .where('id', '=', DEVICE_ID)
    .executeTakeFirstOrThrow();
  return row.config;
}

describe('FountainController hasCamera flag', () => {
  let db: Kysely<Database>;

  beforeEach(async () => {
    db = createDb(':memory:');
    await sql`
      create table device (
        id integer primary key,
        provider_account_id integer not null,
        external_id text not null,
        name text not null,
        type text not null,
        config text,
        enabled integer not null default 1,
        last_seen integer,
        status text,
        created_at integer not null default 0,
        updated_at integer not null default 0
      )
    `.execute(db);
    await db
      .insertInto('device')
      .values({
        id: DEVICE_ID,
        provider_account_id: 1,
        external_id: 'fountain-1',
        name: 'Fountain',
        type: 'water_fountain',
        config: { host: 'fountain.local', filterIntervalDays: 30 },
      })
      .execute();
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('restores hasCamera from config into live state', () => {
    const withCamera = makeController(db, {
      host: 'fountain.local',
      hasCamera: true,
    });
    assert.equal(withCamera.getState().hasCamera, true);

    const withoutCamera = makeController(db, { host: 'fountain.local' });
    assert.equal(withoutCamera.getState().hasCamera, undefined);
  });

  it('patches only the hasCamera key, preserving a concurrently replaced config', async () => {
    const controller = makeController(db, {
      host: 'fountain.local',
      filterIntervalDays: 30,
    });

    // A PATCH /devices/:id lands after the controller loaded its config
    // snapshot and replaces the whole column.
    await db
      .updateTable('device')
      .set({ config: { host: 'renamed.local' } })
      .where('id', '=', DEVICE_ID)
      .execute();

    await access(controller).persistHasCameraFlag();

    assert.deepEqual(await readConfig(db), {
      host: 'renamed.local',
      hasCamera: true,
    });
    assert.equal(access(controller).config.hasCamera, true);
  });

  it('does not write when the flag is already set in memory', async () => {
    const controller = makeController(db, {
      host: 'fountain.local',
      hasCamera: true,
    });

    await access(controller).persistHasCameraFlag();

    assert.deepEqual(await readConfig(db), {
      host: 'fountain.local',
      filterIntervalDays: 30,
    });
  });

  it('swallows and logs a DB failure instead of rejecting', async () => {
    // No device table in this database, so the update rejects.
    const brokenDb = createDb(':memory:');
    const controller = makeController(brokenDb, { host: 'fountain.local' });
    const logged = mock.method(console, 'error', () => {});

    try {
      await assert.doesNotReject(access(controller).persistHasCameraFlag());
      assert.equal(logged.mock.callCount(), 1);
      assert.equal(
        access(controller).config.hasCamera,
        undefined,
        'a failed persist must stay retryable',
      );
    } finally {
      logged.mock.restore();
      await brokenDb.destroy();
    }
  });

  it('fires at most one persist across camera entities and reconnects', () => {
    const controller = makeController(db, { host: 'fountain.local' });
    let persistCalls = 0;
    Object.assign(controller as unknown as Record<string, unknown>, {
      persistHasCameraFlag: async () => {
        persistCalls++;
      },
    });

    const entities = [
      cameraEntity,
      { ...(cameraEntity as object), key: 2 } as EspHomeEntity,
    ];
    access(controller).onEntitiesReceived(entities);
    access(controller).onEntitiesReceived(entities);

    assert.equal(persistCalls, 1);
    assert.equal(controller.getState().hasCamera, true);
  });
});

describe('BaseESPHomeController config parsing', () => {
  it('preserves every optional config field and applies defaults', () => {
    const db = { destroyed: true } as unknown as Kysely<Database>;
    const controller = makeController(db, {
      host: 'fountain.local',
      encryptionKey: 'psk',
      hasCamera: true,
      filterIntervalDays: 45,
      wasteThresholdG: 500,
      litterFullKg: 2.5,
    });

    assert.deepEqual(access(controller).config, {
      host: 'fountain.local',
      port: 6053,
      encryptionKey: 'psk',
      clientId: `cat-health-${DEVICE_ID}`,
      hasCamera: true,
      filterIntervalDays: 45,
      wasteThresholdG: 500,
      litterFullKg: 2.5,
    });
  });

  it('keeps an explicit port and clientId over the defaults', () => {
    const db = {} as unknown as Kysely<Database>;
    const controller = makeController(db, {
      host: 'fountain.local',
      port: 6054,
      clientId: 'custom-client',
    });

    assert.equal(access(controller).config.port, 6054);
    assert.equal(access(controller).config.clientId, 'custom-client');
  });
});
