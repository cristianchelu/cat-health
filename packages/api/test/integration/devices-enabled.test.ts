import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';

import type { Device } from '../../src/database/types/DeviceTable.ts';
import type { IntegrationManager } from '../../src/services/devices/IntegrationManager.ts';
import type { AccountManager } from '../../src/services/devices/types.ts';
import {
  createStubAccountManager,
  createStubDeviceController,
} from '../helpers/accountManagerDoubles.ts';
import {
  insertDevice,
  insertLitterboxEvent,
  insertProviderAccount,
} from '../helpers/fixtures.ts';
import { createTestIntegrationManager } from '../helpers/integrationManager.ts';
import {
  createTestApp,
  createTestDb,
  destroyTestDb,
  type TestDbContext,
} from '../helpers/testDb.ts';

/**
 * Records every device the manager was asked to instantiate a controller for.
 * For a real provider instantiating *is* connecting, so this is the closest a
 * test gets to "did we reach out over the network".
 */
function createSpyAccountManager(accountId: number): {
  manager: AccountManager;
  instantiated: number[];
} {
  const instantiated: number[] = [];
  const manager = createStubAccountManager({
    accountId,
    instantiateDeviceController: (device: Device) => {
      instantiated.push(device.id);
      return createStubDeviceController(device);
    },
  });
  return { manager, instantiated };
}

describe('disabled devices', () => {
  let ctx: TestDbContext;
  let app: FastifyInstance;
  let accountId: number;
  let enabledDevice: Device;
  let disabledDevice: Device;
  /** Owned by the PATCH test alone — see the note in `before`. */
  let doomedDevice: Device;
  let disabledLitterbox: Device;
  let instantiated: number[];

  before(async () => {
    ctx = await createTestDb();

    const account = await insertProviderAccount(ctx.db, {
      provider: 'esphome',
      name: 'Home LAN',
    });
    accountId = account.id;

    enabledDevice = await insertDevice(ctx.db, {
      provider_account_id: accountId,
      name: 'Hall litterbox',
      type: 'litterbox',
      external_id: 'lb-enabled',
      enabled: 1,
    });
    disabledDevice = await insertDevice(ctx.db, {
      provider_account_id: accountId,
      name: 'Retired fountain',
      type: 'water_fountain',
      external_id: 'wf-disabled',
      enabled: 0,
    });
    // The PATCH test switches its subject off, so it gets a device of its own
    // rather than leaving the tests above order-dependent.
    doomedDevice = await insertDevice(ctx.db, {
      provider_account_id: accountId,
      name: 'Doomed feeder',
      type: 'feeder',
      external_id: 'fd-doomed',
      enabled: 1,
    });
    disabledLitterbox = await insertDevice(ctx.db, {
      provider_account_id: accountId,
      name: 'Retired litterbox',
      type: 'litterbox',
      external_id: 'lb-disabled',
      enabled: 0,
    });
    // A deposit inside the 14-day window, so the litterbox enricher has
    // something to attach and the suppression is actually put under load.
    await insertLitterboxEvent(ctx.db, {
      device_id: disabledLitterbox.id,
      pet_id: null,
      elimination_type: 'defecation',
      elimination_weight: 45,
    });

    const spy = createSpyAccountManager(accountId);
    instantiated = spy.instantiated;
    app = await createTestApp(ctx, {
      integrationManager: createTestIntegrationManager(ctx.db, {
        accountManagers: new Map([[accountId, spy.manager]]),
      }),
    });
  });

  after(async () => {
    await app.close();
    await destroyTestDb(ctx);
  });

  it('never instantiates a controller for a device stored as disabled', async () => {
    const list = await app.inject({ method: 'GET', url: '/api/devices' });
    assert.equal(list.statusCode, 200);

    assert.ok(
      instantiated.includes(enabledDevice.id),
      'the enabled device should still get a controller',
    );
    assert.ok(
      !instantiated.includes(disabledDevice.id),
      'listing devices must not reach out to a disabled one',
    );
  });

  it('reports a disabled device as disabled, with no signals to act on', async () => {
    const list = await app.inject({ method: 'GET', url: '/api/devices' });
    assert.equal(list.statusCode, 200);

    const row = list
      .json()
      .find((entry: { id: number }) => entry.id === disabledDevice.id);
    assert.ok(row);
    assert.equal(row.enabled, false);
    assert.equal(row.account_enabled, true);

    // Turning a device off is not an outage. `presenceSignals` would otherwise
    // read the stale presence row and raise an OFFLINE alarm the user caused.
    assert.deepEqual(row.signals, []);
  });

  it('leaves a disabled litterbox without deposit pips too', async () => {
    const list = await app.inject({ method: 'GET', url: '/api/devices' });
    assert.equal(list.statusCode, 200);

    const row = list
      .json()
      .find((entry: { id: number }) => entry.id === disabledLitterbox.id);
    assert.ok(row);
    assert.deepEqual(row.signals, []);
  });

  it('keeps a device disconnected after it is disabled, across later list fetches', async () => {
    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/devices/${doomedDevice.id}`,
      payload: { enabled: false },
    });
    assert.equal(patch.statusCode, 200);
    assert.equal(patch.json().enabled, false);

    instantiated.length = 0;

    // `mapDevice` instantiates a controller for every row it maps, so a list
    // request is what would resurrect the device and restart its reconnect loop.
    await app.inject({ method: 'GET', url: '/api/devices' });
    await app.inject({ method: 'GET', url: '/api/devices' });

    assert.ok(
      !instantiated.includes(doomedDevice.id),
      'the disabled device must not come back on a later list fetch',
    );
  });
});

describe('devices on a disabled provider account', () => {
  let ctx: TestDbContext;
  let app: FastifyInstance;
  let device: Device;

  before(async () => {
    ctx = await createTestDb();

    const account = await insertProviderAccount(ctx.db, {
      provider: 'esphome',
      name: 'Retired LAN',
      enabled: 0,
    });
    device = await insertDevice(ctx.db, {
      provider_account_id: account.id,
      name: 'Orphaned litterbox',
      type: 'litterbox',
      external_id: 'lb-orphan',
      enabled: 1,
    });

    // A manager is registered so the row maps as it would for a healthy
    // account: this case is about what the payload says, not about whether a
    // controller gets built.
    const spy = createSpyAccountManager(account.id);
    app = await createTestApp(ctx, {
      integrationManager: createTestIntegrationManager(ctx.db, {
        accountManagers: new Map([[account.id, spy.manager]]),
      }),
    });
  });

  after(async () => {
    await app.close();
    await destroyTestDb(ctx);
  });

  it('carries the account switch through to the client', async () => {
    const list = await app.inject({ method: 'GET', url: '/api/devices' });
    assert.equal(list.statusCode, 200);
    const row = list.json()[0];
    assert.equal(row.enabled, true);
    assert.equal(row.account_enabled, false);

    // Which of the two switches is off changes nothing: nothing is dialling
    // this device, so its stale presence row is not an outage.
    assert.deepEqual(row.signals, []);

    const detail = await app.inject({
      method: 'GET',
      url: `/api/devices/${device.id}`,
    });
    assert.equal(detail.statusCode, 200);
    assert.equal(detail.json().account_enabled, false);
  });

  // The device's own switch is already on, so this PATCH is the one move a user
  // has that could plausibly resurrect it. The account still outranks it.
  it('stays unreachable when its own switch is patched back on', async () => {
    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/devices/${device.id}`,
      payload: { enabled: true },
    });
    assert.equal(patch.statusCode, 200);
    assert.equal(patch.json().enabled, true);
    assert.equal(patch.json().account_enabled, false);
    assert.deepEqual(patch.json().signals, []);

    const snapshot = await app.inject({
      method: 'GET',
      url: `/api/devices/${device.id}/snapshot`,
    });
    assert.equal(snapshot.statusCode, 400);
    assert.match(snapshot.json().message, /disabled/);
  });
});

describe('routes that need a live controller', () => {
  let ctx: TestDbContext;
  let app: FastifyInstance;
  let camera: Device;
  let recognizer: Device;
  let orphanedCamera: Device;
  let orphanedRecognizer: Device;

  before(async () => {
    ctx = await createTestDb();

    const account = await insertProviderAccount(ctx.db, {
      provider: 'inference',
      name: 'Inference account',
    });
    camera = await insertDevice(ctx.db, {
      provider_account_id: account.id,
      name: 'Retired camera',
      type: 'camera',
      external_id: 'cam-disabled',
      enabled: 0,
    });
    recognizer = await insertDevice(ctx.db, {
      provider_account_id: account.id,
      name: 'Retired recognizer',
      type: 'pet_recognizer',
      external_id: 'rec-disabled',
      enabled: 0,
    });

    // No manager is registered for it, the way a disabled account never
    // reaches `accountManagers` in production.
    const offAccount = await insertProviderAccount(ctx.db, {
      provider: 'inference',
      name: 'Retired inference account',
      enabled: 0,
    });
    orphanedCamera = await insertDevice(ctx.db, {
      provider_account_id: offAccount.id,
      name: 'Orphaned camera',
      type: 'camera',
      external_id: 'cam-orphan',
      enabled: 1,
    });
    orphanedRecognizer = await insertDevice(ctx.db, {
      provider_account_id: offAccount.id,
      name: 'Orphaned recognizer',
      type: 'pet_recognizer',
      external_id: 'rec-orphan',
      enabled: 1,
    });

    const spy = createSpyAccountManager(account.id);
    app = await createTestApp(ctx, {
      integrationManager: createTestIntegrationManager(ctx.db, {
        accountManagers: new Map([[account.id, spy.manager]]),
      }),
    });
  });

  after(async () => {
    await app.close();
    await destroyTestDb(ctx);
  });

  // Both routes fail on a missing controller, so without a distinct answer a
  // disabled device reads as a misconfiguration.
  it('says a snapshot failed because the camera is disabled', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/devices/${camera.id}/snapshot`,
    });

    assert.equal(res.statusCode, 400);
    assert.match((res.json() as { message: string }).message, /disabled/i);
  });

  it('says test-identify failed because the recognizer is disabled', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/devices/${recognizer.id}/test-identify`,
      payload: { media_id: 1 },
    });

    assert.equal(res.statusCode, 400);
    assert.match((res.json() as { message: string }).message, /disabled/i);
  });

  // The account switch makes a device exactly as unreachable as its own does,
  // so it has to read the same way at the routes too.
  it('says the same when it is the account that is switched off', async () => {
    const snapshot = await app.inject({
      method: 'GET',
      url: `/api/devices/${orphanedCamera.id}/snapshot`,
    });
    assert.equal(snapshot.statusCode, 400);
    assert.match((snapshot.json() as { message: string }).message, /disabled/i);

    const identify = await app.inject({
      method: 'POST',
      url: `/api/devices/${orphanedRecognizer.id}/test-identify`,
      payload: { media_id: 1 },
    });
    assert.equal(identify.statusCode, 400);
    assert.match((identify.json() as { message: string }).message, /disabled/i);
  });

  it('answers 404 for a device that does not exist', async () => {
    const snapshot = await app.inject({
      method: 'GET',
      url: '/api/devices/999999/snapshot',
    });
    assert.equal(snapshot.statusCode, 404);

    const identify = await app.inject({
      method: 'POST',
      url: '/api/devices/999999/test-identify',
      payload: { media_id: 1 },
    });
    assert.equal(identify.statusCode, 404);
  });
});

describe('disabling a provider account', () => {
  let ctx: TestDbContext;
  let app: FastifyInstance;
  let integrationManager: IntegrationManager;
  let accountId: number;
  let instantiated: number[];

  before(async () => {
    ctx = await createTestDb();

    const account = await insertProviderAccount(ctx.db, {
      provider: 'esphome',
      name: 'Soon-to-be-off LAN',
    });
    accountId = account.id;
    await insertDevice(ctx.db, {
      provider_account_id: accountId,
      name: 'Hall litterbox',
      type: 'litterbox',
      external_id: 'lb-account-off',
    });

    const spy = createSpyAccountManager(accountId);
    instantiated = spy.instantiated;
    integrationManager = createTestIntegrationManager(ctx.db, {
      accountManagers: new Map([[accountId, spy.manager]]),
    });
    app = await createTestApp(ctx, { integrationManager });
  });

  after(async () => {
    await app.close();
    await destroyTestDb(ctx);
  });

  it('tears the account manager down instead of re-initializing it', async () => {
    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/devices/accounts/${accountId}`,
      payload: { enabled: false },
    });
    assert.equal(patch.statusCode, 200);
    assert.equal(patch.json().enabled, false);

    // The route calls `initializeAccount` after any patch, so the disable has
    // to be honoured there rather than rebuilding what it just stopped.
    assert.equal(integrationManager.getAccountManager(accountId), undefined);

    instantiated.length = 0;
    await app.inject({ method: 'GET', url: '/api/devices' });
    assert.deepEqual(instantiated, []);
  });
});

describe('presence when a provider account is switched off', () => {
  let ctx: TestDbContext;
  let app: FastifyInstance;
  let integrationManager: IntegrationManager;
  let accountId: number;
  let deviceId: number;

  /** The anti-flap delay `reportOffline` arms, plus a margin. */
  const OFFLINE_EVENT_DELAY_MS = 60_000;

  async function connectivityEventCount(): Promise<number> {
    const rows = await ctx.db
      .selectFrom('event')
      .select('id')
      .where('device_id', '=', deviceId)
      .where(sql`json_extract(data, '$.type')`, '=', 'device_connectivity')
      .where(sql`json_extract(data, '$.state')`, '=', 'offline')
      .execute();
    return rows.length;
  }

  before(async () => {
    ctx = await createTestDb();

    const account = await insertProviderAccount(ctx.db, {
      provider: 'esphome',
      name: 'Soon-to-be-off LAN',
    });
    accountId = account.id;
    const device = await insertDevice(ctx.db, {
      provider_account_id: accountId,
      name: 'Hall litterbox',
      type: 'litterbox',
      external_id: 'lb-account-presence',
    });
    deviceId = device.id;

    integrationManager = createTestIntegrationManager(ctx.db);
    integrationManager.registerAccountManager(
      accountId,
      createStubAccountManager({
        accountId,
        // What a real controller does on teardown: `disconnect()` reports
        // offline, because that is all the transport knows.
        shutdown: async () => {
          integrationManager.getPresence().reportOffline(deviceId);
        },
        instantiateDeviceController: (device: Device) =>
          createStubDeviceController(device),
      }),
    );
    app = await createTestApp(ctx, { integrationManager });
    await integrationManager.getPresence().hydrateAll();
  });

  after(async () => {
    await app.close();
    await destroyTestDb(ctx);
  });

  it('does not post an outage for the devices it tears down', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const presence = integrationManager.getPresence();
    presence.reportOnline(deviceId);

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/devices/accounts/${accountId}`,
      payload: { enabled: false },
    });
    assert.equal(patch.statusCode, 200);

    t.mock.timers.tick(OFFLINE_EVENT_DELAY_MS + 1);
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(
      await connectivityEventCount(),
      0,
      'switching the account off is not an outage the user should be told about',
    );
  });

  it('hears the device again once the account comes back', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const presence = integrationManager.getPresence();
    const before = await connectivityEventCount();

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/devices/accounts/${accountId}`,
      payload: { enabled: true },
    });
    assert.equal(patch.statusCode, 200);

    presence.reportOnline(deviceId);
    presence.reportOffline(deviceId);
    t.mock.timers.tick(OFFLINE_EVENT_DELAY_MS + 1);
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(
      (await connectivityEventCount()) - before,
      1,
      'a real drop after re-enabling is still news',
    );
  });
});
