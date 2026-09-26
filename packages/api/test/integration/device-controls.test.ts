import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { GetDeviceResponseDTO, GetDevicesResponseDTO } from 'shared';

import { EventBus } from '../../src/services/devices/EventBus.ts';
import { composeControlSurface } from '../../src/services/devices/control/composeControlSurface.ts';
import { DeviceControl } from '../../src/services/devices/control/DeviceControl.ts';
import {
  createStubAccountManager,
  createStubDeviceController,
} from '../helpers/accountManagerDoubles.ts';
import { insertDevice, insertProviderAccount } from '../helpers/fixtures.ts';
import { createTestIntegrationManager } from '../helpers/integrationManager.ts';
import {
  createTestApp,
  createTestDb,
  destroyTestDb,
  type TestDbContext,
} from '../helpers/testDb.ts';

describe('device controls routes', () => {
  let ctx: TestDbContext;
  let app: FastifyInstance;
  let deviceId: number;
  const state = { target: 40, presses: 0 };

  before(async () => {
    ctx = await createTestDb();
    const account = await insertProviderAccount(ctx.db, { name: 'Bench' });
    const device = await insertDevice(ctx.db, {
      provider_account_id: account.id,
      external_id: 'controls-1',
      name: 'Bench feeder',
      type: 'feeder',
    });
    deviceId = device.id;

    // A device whose channel writes straight into `state`, as an entity that
    // echoes its new value would.
    // A write the channel reports as unconfirmed, as a device that never
    // echoes would.
    const neverConfirmed = () => {};
    const surface = composeControlSurface<() => void, typeof state>({
      state: () => state,
      settings: [
        {
          descriptor: {
            key: 'dev:number.target',
            label: { text: 'Target' },
            type: { kind: 'number', min: 0, max: 100, step: 5, unit: 'g' },
            placement: 'setting',
            group: 'config',
          },
          read: (s) => s.target,
          encode: (value) => [
            () => {
              state.target = value as number;
            },
          ],
        },
      ],
      actions: [
        {
          key: 'dev:button.silent',
          descriptor: () => ({
            key: 'dev:button.silent',
            label: { text: 'Silent' },
            args: {},
            confirm: false,
            available: true,
            group: 'primary',
          }),
          encode: () => [neverConfirmed],
        },
        {
          key: 'dev:button.press',
          descriptor: () => ({
            key: 'dev:button.press',
            label: { text: 'Press' },
            args: {},
            confirm: false,
            available: true,
            group: 'primary',
          }),
          encode: () => [
            () => {
              state.presses += 1;
            },
          ],
        },
      ],
      channel: {
        submit: async (write) => {
          if (write === neverConfirmed) {
            return { status: 'failed', reason: 'timeout' };
          }
          write();
          return { status: 'applied' };
        },
      },
    });

    const integrationManager = createTestIntegrationManager(ctx.db, {
      accountManagers: new Map([
        [
          account.id,
          createStubAccountManager({
            accountId: account.id,
            instantiateDeviceController: (row) =>
              createStubDeviceController(row, { controls: () => surface }),
          }),
        ],
      ]),
    });
    app = await createTestApp(ctx, {
      integrationManager,
      deviceControl: new DeviceControl({
        context: integrationManager,
        eventBus: new EventBus(),
      }),
    });
  });

  after(async () => {
    await app.close();
    await destroyTestDb(ctx);
  });

  it('lists a device controls with their current values on the detail', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/devices/${deviceId}`,
    });
    assert.equal(res.statusCode, 200);
    const body = res.json<GetDeviceResponseDTO>();

    const target = body.controls?.settings.find(
      (setting) => setting.key === 'dev:number.target',
    );
    assert.equal(target?.value, state.target);
    assert.deepEqual(
      body.controls?.actions.map((action) => action.key),
      ['dev:button.silent', 'dev:button.press'],
    );
  });

  it('leaves controls off the device list', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/devices' });
    const row = res
      .json<GetDevicesResponseDTO>()
      .find((d) => d.id === deviceId);
    assert.ok(row);
    assert.equal('controls' in row, false);
  });

  it('writes a setting and reports it applied', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/devices/${deviceId}/settings`,
      payload: { 'dev:number.target': 55 },
    });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { status: 'applied' });
    assert.equal(state.target, 55);
  });

  it('rejects a value outside the setting bounds without writing it', async () => {
    const before = state.target;
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/devices/${deviceId}/settings`,
      payload: { 'dev:number.target': 101 },
    });

    assert.equal(res.statusCode, 400);
    assert.equal(state.target, before);
  });

  it('answers 404 for a setting the device does not offer', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/devices/${deviceId}/settings`,
      payload: { 'dev:number.missing': 1 },
    });

    assert.equal(res.statusCode, 404);
  });

  it('runs an action by its key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/devices/${deviceId}/actions/${encodeURIComponent('dev:button.press')}`,
      payload: {},
    });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { status: 'applied' });
    assert.equal(state.presses, 1);
  });

  it('answers a write the device never confirmed as a gateway timeout', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/devices/${deviceId}/actions/${encodeURIComponent('dev:button.silent')}`,
      payload: {},
    });

    assert.equal(res.statusCode, 504);
    assert.equal(res.json<{ reason: string }>().reason, 'timeout');
  });
});
