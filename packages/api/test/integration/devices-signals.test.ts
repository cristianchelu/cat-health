import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import {
  DEVICE_SIGNAL_KEYS,
  type GetDeviceResponseDTO,
  type GetDevicesResponseDTO,
} from 'shared';

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

const HOUR = 3_600_000;

async function insertMaintenanceEvent(
  ctx: TestDbContext,
  deviceId: number,
  maintenanceType: 'scoop' | 'deep_clean',
  timestamp: Date,
) {
  await ctx.db
    .insertInto('event')
    .values({
      device_id: deviceId,
      parent_event_id: null,
      pet_id: null,
      timestamp,
      data: { type: 'litterbox_maintenance', maintenance_type: maintenanceType },
      raw_data: null,
      human_verified: false,
    })
    .execute();
}

describe('device signals', () => {
  let ctx: TestDbContext;
  let app: FastifyInstance;
  let litterboxId: number;
  let otherLitterboxId: number;

  before(async () => {
    ctx = await createTestDb();
    app = await createTestApp(ctx, {
      integrationManager: createTestIntegrationManager(ctx.db),
    });

    const account = await insertProviderAccount(ctx.db, {
      provider: 'esphome',
      name: 'Local ESPHome',
    });

    const litterbox = await insertDevice(ctx.db, {
      provider_account_id: account.id,
      external_id: 'lb-1',
      name: 'Bedroom',
      type: 'litterbox',
    });
    litterboxId = litterbox.id;

    const otherLitterbox = await insertDevice(ctx.db, {
      provider_account_id: account.id,
      external_id: 'lb-2',
      name: 'Loft',
      type: 'litterbox',
    });
    otherLitterboxId = otherLitterbox.id;

    const now = Date.now();

    // Visits before the scoop must not be counted.
    await insertLitterboxEvent(ctx.db, {
      device_id: litterboxId,
      pet_id: null,
      elimination_type: 'urination',
      elimination_weight: 40,
      timestamp: new Date(now - 6 * HOUR),
    });
    await insertLitterboxEvent(ctx.db, {
      device_id: litterboxId,
      pet_id: null,
      elimination_type: 'defecation',
      elimination_weight: 60,
      timestamp: new Date(now - 5 * HOUR),
    });

    await insertMaintenanceEvent(ctx, litterboxId, 'scoop', new Date(now - 4 * HOUR));

    await insertLitterboxEvent(ctx.db, {
      device_id: litterboxId,
      pet_id: null,
      elimination_type: 'urination',
      elimination_weight: 30,
      timestamp: new Date(now - 3 * HOUR),
    });
    await insertLitterboxEvent(ctx.db, {
      device_id: litterboxId,
      pet_id: null,
      elimination_type: 'urination',
      elimination_weight: 25,
      timestamp: new Date(now - 2 * HOUR),
    });
    await insertLitterboxEvent(ctx.db, {
      device_id: litterboxId,
      pet_id: null,
      elimination_type: 'defecation',
      elimination_weight: 55,
      timestamp: new Date(now - 1 * HOUR),
    });

    // A visit with nothing deposited leaves no pip.
    await insertLitterboxEvent(ctx.db, {
      device_id: litterboxId,
      pet_id: null,
      elimination_type: 'no_elimination',
      elimination_weight: 0,
      timestamp: new Date(now - 30 * 60_000),
    });

    // A second box that has never been scooped counts everything it has.
    await insertLitterboxEvent(ctx.db, {
      device_id: otherLitterboxId,
      pet_id: null,
      elimination_type: 'both',
      elimination_weight: 70,
      timestamp: new Date(now - 8 * HOUR),
    });
  });

  after(async () => {
    await app.close();
    await destroyTestDb(ctx);
  });

  it('omits state from the list and keeps it on the single device', async () => {
    const list = await app.inject({ method: 'GET', url: '/api/devices' });
    assert.equal(list.statusCode, 200);
    for (const device of list.json<GetDevicesResponseDTO>()) {
      assert.ok(
        !('state' in device),
        'list rows must not carry the controller state payload',
      );
      assert.ok(Array.isArray(device.signals));
    }

    const detail = await app.inject({
      method: 'GET',
      url: `/api/devices/${litterboxId}`,
    });
    assert.equal(detail.statusCode, 200);
    assert.ok(Array.isArray(detail.json<GetDeviceResponseDTO>().signals));
  });

  it('counts deposits since the last scoop, in visit order', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/devices' });
    const device = res
      .json<GetDevicesResponseDTO>()
      .find((candidate) => candidate.id === litterboxId);
    assert.ok(device);

    const waste = device.signals?.find(
      (signal) => signal.key === DEVICE_SIGNAL_KEYS.WASTE_SINCE_SCOOP,
    );
    assert.ok(waste, 'expected a waste signal on a litterbox with visits');
    assert.equal(waste.display.kind, 'pips');
    assert.deepEqual(
      waste.display.kind === 'pips' ? waste.display.pips : null,
      ['urination', 'urination', 'defecation'],
    );
  });

  it('counts every visit on a box that has never been scooped', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/devices' });
    const device = res
      .json<GetDevicesResponseDTO>()
      .find((candidate) => candidate.id === otherLitterboxId);
    assert.ok(device);

    const waste = device.signals?.find(
      (signal) => signal.key === DEVICE_SIGNAL_KEYS.WASTE_SINCE_SCOOP,
    );
    assert.ok(waste);
    assert.deepEqual(
      waste.display.kind === 'pips' ? waste.display.pips : null,
      ['both'],
    );
  });

  it('reports a never-reached device as unreachable, not as blank', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/devices' });
    const device = res
      .json<GetDevicesResponseDTO>()
      .find((candidate) => candidate.id === litterboxId);
    assert.ok(device);

    /* Nothing has connected these fixtures, so presence reports `unknown`.
     * That used to emit no signals at all, leaving the card with nothing to
     * render on any device restored from a backup. */
    assert.equal(device.status, 'unknown');

    const offline = device.signals?.find(
      (signal) => signal.key === DEVICE_SIGNAL_KEYS.OFFLINE,
    );
    assert.ok(offline, 'a device we have never reached must say so');
    assert.equal(offline.severity?.kind, 'hours');
    assert.deepEqual(offline.value, {
      kind: 'text',
      key: 'devices.signals.values.never_seen',
    });
  });

  it('ignores visits older than the lookback window', async () => {
    const stale = await insertDevice(ctx.db, {
      provider_account_id: (
        await ctx.db
          .selectFrom('provider_account')
          .select('id')
          .executeTakeFirstOrThrow()
      ).id,
      external_id: 'lb-3',
      name: 'Attic',
      type: 'litterbox',
    });

    // Never scooped, but every visit predates the window.
    await insertLitterboxEvent(ctx.db, {
      device_id: stale.id,
      pet_id: null,
      elimination_type: 'urination',
      elimination_weight: 40,
      timestamp: new Date(Date.now() - 40 * 24 * HOUR),
    });

    const res = await app.inject({ method: 'GET', url: '/api/devices' });
    const device = res
      .json<GetDevicesResponseDTO>()
      .find((candidate) => candidate.id === stale.id);

    const waste = device?.signals?.find(
      (signal) => signal.key === DEVICE_SIGNAL_KEYS.WASTE_SINCE_SCOOP,
    );
    assert.equal(
      waste,
      undefined,
      'an unbounded history would be scanned in full on every page load',
    );
  });
});
