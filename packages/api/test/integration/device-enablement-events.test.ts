import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';

import type { Device } from '../../src/database/types/DeviceTable.ts';
import type { IntegrationManager } from '../../src/services/devices/IntegrationManager.ts';
import { computeUntrackedBuckets } from '../../src/services/analytics/trendCoverage.ts';
import {
  createStubAccountManager,
  createStubDeviceController,
} from '../helpers/accountManagerDoubles.ts';
import {
  insertDevice,
  insertPet,
  insertProviderAccount,
} from '../helpers/fixtures.ts';
import { createTestIntegrationManager } from '../helpers/integrationManager.ts';
import {
  createTestApp,
  createTestDb,
  destroyTestDb,
  type TestDbContext,
} from '../helpers/testDb.ts';

interface StatusRow {
  type: string;
  state?: string;
  enabled?: boolean;
  cause?: string;
}

/** The device's status timeline in insertion order: connectivity and switch. */
async function statusTimeline(
  ctx: TestDbContext,
  deviceId: number,
): Promise<StatusRow[]> {
  const rows = await ctx.db
    .selectFrom('event')
    .select('data')
    .where('device_id', '=', deviceId)
    .where(sql`json_extract(data, '$.type')`, 'in', [
      'device_connectivity',
      'device_enablement',
    ])
    .orderBy('timestamp', 'asc')
    .orderBy('id', 'asc')
    .execute();

  return rows.map((row) => {
    const data = row.data as StatusRow;
    return data.type === 'device_enablement'
      ? { type: data.type, enabled: data.enabled, cause: data.cause }
      : { type: data.type, state: data.state };
  });
}

describe('device switch events', () => {
  let ctx: TestDbContext;
  let app: FastifyInstance;
  let integrationManager: IntegrationManager;
  let accountId: number;
  let device: Device;

  before(async () => {
    ctx = await createTestDb();
    const account = await insertProviderAccount(ctx.db, {
      provider: 'esphome',
      name: 'Home LAN',
    });
    accountId = account.id;
    device = await insertDevice(ctx.db, {
      provider_account_id: accountId,
      name: 'Kitchen fountain',
      type: 'water_fountain',
      external_id: 'fountain-switch',
    });

    integrationManager = createTestIntegrationManager(ctx.db);
    integrationManager.registerAccountManager(
      accountId,
      createStubAccountManager({
        accountId,
        // A provider whose connect reports online synchronously, like SurePet:
        // the tightest ordering the `enabled` event has to beat.
        instantiateDeviceController: (row: Device) => {
          integrationManager.getPresence().reportOnline(row.id);
          return createStubDeviceController(row);
        },
      }),
    );
    app = await createTestApp(ctx, { integrationManager });
    await integrationManager.getPresence().hydrateAll();
  });

  after(async () => {
    await app.close();
    await destroyTestDb(ctx);
  });

  async function patchDevice(payload: Record<string, unknown>) {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/devices/${device.id}`,
      payload,
    });
    assert.equal(res.statusCode, 200);
  }

  it('posts one "disabled" when the device is switched off', async () => {
    await patchDevice({ enabled: false });

    const switches = (await statusTimeline(ctx, device.id)).filter(
      (row) => row.type === 'device_enablement',
    );
    assert.deepEqual(switches, [
      { type: 'device_enablement', enabled: false, cause: 'device' },
    ]);
  });

  it('stays quiet when the switch is set to what it already is', async () => {
    await patchDevice({ enabled: false });
    await patchDevice({ name: 'Kitchen fountain (spare)' });

    const switches = (await statusTimeline(ctx, device.id)).filter(
      (row) => row.type === 'device_enablement',
    );
    assert.equal(switches.length, 1);
  });

  it('posts "enabled" before the online that reconnecting reports', async () => {
    await patchDevice({ enabled: true });

    const timeline = await statusTimeline(ctx, device.id);
    const enabledAt = timeline.findIndex(
      (row) => row.type === 'device_enablement' && row.enabled === true,
    );
    const onlineAt = timeline.findIndex(
      (row, index) =>
        index > enabledAt &&
        row.type === 'device_connectivity' &&
        row.state === 'online',
    );
    assert.ok(enabledAt >= 0, 'switching on is recorded');
    assert.ok(onlineAt > enabledAt, 'the reconnect lands after the switch');
  });
});

describe('device switch events on an account toggle', () => {
  let ctx: TestDbContext;
  let app: FastifyInstance;
  let accountId: number;
  let onDevice: Device;
  let offDevice: Device;

  before(async () => {
    ctx = await createTestDb();
    const account = await insertProviderAccount(ctx.db, {
      provider: 'esphome',
      name: 'Whole-house LAN',
    });
    accountId = account.id;
    onDevice = await insertDevice(ctx.db, {
      provider_account_id: accountId,
      name: 'Hall litterbox',
      type: 'litterbox',
      external_id: 'lb-account-switch',
    });
    offDevice = await insertDevice(ctx.db, {
      provider_account_id: accountId,
      name: 'Retired feeder',
      type: 'feeder',
      external_id: 'feeder-account-switch',
      enabled: 0,
    });

    const inertManager = () =>
      createStubAccountManager({
        accountId,
        instantiateDeviceController: (row: Device) =>
          createStubDeviceController(row),
      });
    // Switching the account back on rebuilds its manager from the provider.
    const integrationManager = createTestIntegrationManager(ctx.db, {
      accountManagers: new Map([[accountId, inertManager()]]),
      inertProviders: new Map([['esphome', inertManager]]),
    });
    app = await createTestApp(ctx, { integrationManager });
  });

  after(async () => {
    await app.close();
    await destroyTestDb(ctx);
  });

  async function patchAccount(payload: Record<string, unknown>) {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/devices/accounts/${accountId}`,
      payload,
    });
    assert.equal(res.statusCode, 200);
  }

  const switches = async (deviceId: number) =>
    (await statusTimeline(ctx, deviceId)).filter(
      (row) => row.type === 'device_enablement',
    );

  it('moves every device with the account, naming the switch that is off', async () => {
    await patchAccount({ enabled: false });

    assert.deepEqual(await switches(onDevice.id), [
      { type: 'device_enablement', enabled: false, cause: 'account' },
    ]);
    // Its own switch predates the event kind, so this is the first chance to
    // write it down — and it is that switch, not the account, that holds it.
    assert.deepEqual(await switches(offDevice.id), [
      { type: 'device_enablement', enabled: false, cause: 'device' },
    ]);
  });

  it('ignores a config-only account edit', async () => {
    await patchAccount({ name: 'Whole-house LAN (renamed)' });
    assert.equal((await switches(onDevice.id)).length, 1);
  });

  it('brings the devices back with the account', async () => {
    await patchAccount({ enabled: true });

    assert.deepEqual(await switches(onDevice.id), [
      { type: 'device_enablement', enabled: false, cause: 'account' },
      { type: 'device_enablement', enabled: true, cause: 'account' },
    ]);
    // Still off in its own right.
    assert.equal((await switches(offDevice.id)).length, 1);
  });
});

describe('coverage of a switched-off device', () => {
  let ctx: TestDbContext;
  let petId: number;
  let deviceId: number;

  const TZ = 'UTC';
  const day = (n: number, hour = 12) =>
    new Date(Date.UTC(2026, 5, n, hour, 0, 0));

  async function insertStatus(
    timestamp: Date,
    data: Record<string, unknown>,
  ): Promise<void> {
    await ctx.db
      .insertInto('event')
      .values({
        pet_id: null,
        caused_by: 'unknown',
        attributed_by: null,
        device_id: deviceId,
        parent_event_id: null,
        timestamp,
        data: data as never,
        raw_data: null,
        human_verified: true,
      })
      .execute();
  }

  before(async () => {
    ctx = await createTestDb();
    const pet = await insertPet(ctx.db, { name: 'Thirsty Cat' });
    petId = pet.id;
    const account = await insertProviderAccount(ctx.db, {
      provider: 'esphome',
      name: 'Home LAN',
    });
    // Off now — but the chart asks what happened while it was in service.
    const device = await insertDevice(ctx.db, {
      provider_account_id: account.id,
      name: 'Faulty fountain',
      type: 'water_fountain',
      external_id: 'fountain-retired',
      enabled: 0,
    });
    deviceId = device.id;

    await insertStatus(day(1, 8), {
      type: 'device_connectivity',
      state: 'online',
    });
    // Hardware fault: offline from day 3, never heard from again.
    await insertStatus(day(3, 8), {
      type: 'device_connectivity',
      state: 'offline',
    });
    // Retired on day 6: from here it is not part of the house.
    await insertStatus(day(6, 8), {
      type: 'device_enablement',
      enabled: false,
    });
  });

  after(async () => {
    await destroyTestDb(ctx);
  });

  async function untrackedDays(from: number, to: number): Promise<string[]> {
    const buckets = await computeUntrackedBuckets(ctx.db, {
      petId,
      deviceClass: 'water_fountain',
      range: { start: day(from, 0), end: day(to, 0) },
      resolution: 'day',
      timezone: TZ,
    });
    return [...buckets].sort();
  }

  it('keeps hatching the outage it suffered while in service', async () => {
    assert.deepEqual(await untrackedDays(1, 10), [
      '2026-06-03',
      '2026-06-04',
      '2026-06-05',
      '2026-06-06',
    ]);
  });

  it('contributes nothing once retired, even with the outage out of range', async () => {
    assert.deepEqual(await untrackedDays(7, 10), []);
  });

  it('is untracked again from switch-on until it is next heard from', async () => {
    await insertStatus(day(8, 8), { type: 'device_enablement', enabled: true });
    await insertStatus(day(9, 8), {
      type: 'device_connectivity',
      state: 'online',
    });

    assert.deepEqual(await untrackedDays(7, 10), ['2026-06-08', '2026-06-09']);
  });
});
