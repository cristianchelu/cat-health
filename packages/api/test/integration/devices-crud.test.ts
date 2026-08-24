import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';

import {
  createDeviceFriendlyAccountManager,
  createStubAccountManager,
} from '../helpers/accountManagerDoubles.ts';
import { insertDevice, insertProviderAccount } from '../helpers/fixtures.ts';
import { createTestIntegrationManager } from '../helpers/integrationManager.ts';
import {
  createTestApp,
  createTestDb,
  destroyTestDb,
  type TestDbContext,
} from '../helpers/testDb.ts';

describe('devices API CRUD', () => {
  describe('provider accounts', () => {
    let ctx: TestDbContext;
    let app: FastifyInstance;

    before(async () => {
      ctx = await createTestDb();
      app = await createTestApp(ctx, {
        integrationManager: createTestIntegrationManager(ctx.db),
      });
    });

    after(async () => {
      await app.close();
      await destroyTestDb(ctx);
    });

    it('creates and lists a provider account', async () => {
      const create = await app.inject({
        method: 'POST',
        url: '/api/devices/accounts',
        payload: {
          provider: 'esphome',
          name: 'Home LAN',
          config: {},
        },
      });

      assert.equal(create.statusCode, 200);
      const account = create.json();
      assert.equal(account.provider, 'esphome');
      assert.equal(account.name, 'Home LAN');

      const list = await app.inject({
        method: 'GET',
        url: '/api/devices/accounts',
      });
      assert.equal(list.statusCode, 200);
      const accounts = list.json();
      assert.ok(accounts.some((row: { id: number }) => row.id === account.id));
    });

    it('gets and patches a provider account (name + enabled)', async () => {
      const create = await app.inject({
        method: 'POST',
        url: '/api/devices/accounts',
        payload: {
          provider: 'esphome',
          name: 'Patchable LAN',
          config: { host: '192.168.1.1' },
        },
      });
      assert.equal(create.statusCode, 200);
      const account = create.json() as { id: number; enabled: boolean };

      const get = await app.inject({
        method: 'GET',
        url: `/api/devices/accounts/${account.id}`,
      });
      assert.equal(get.statusCode, 200);
      assert.equal(get.json().id, account.id);
      assert.equal(get.json().name, 'Patchable LAN');
      assert.equal(get.json().enabled, true);

      const patch = await app.inject({
        method: 'PATCH',
        url: `/api/devices/accounts/${account.id}`,
        payload: { name: 'Disabled LAN', enabled: false },
      });
      assert.equal(patch.statusCode, 200);
      assert.equal(patch.json().name, 'Disabled LAN');
      assert.equal(patch.json().enabled, false);

      const list = await app.inject({
        method: 'GET',
        url: '/api/devices/accounts',
      });
      assert.equal(list.statusCode, 200);
      const row = list
        .json()
        .find((entry: { id: number }) => entry.id === account.id);
      assert.ok(row);
      assert.equal(row.enabled, false);
      assert.equal(row.name, 'Disabled LAN');
    });
  });

  describe('registered devices', () => {
    let ctx: TestDbContext;

    before(async () => {
      ctx = await createTestDb();
    });

    after(async () => {
      await destroyTestDb(ctx);
    });

    it('lists, fetches, and patches a registered device', async () => {
      const account = await insertProviderAccount(ctx.db, {
        provider: 'inference',
        name: 'Inference account',
      });
      const manager = createDeviceFriendlyAccountManager(account.id);
      const app = await createTestApp(ctx, {
        integrationManager: createTestIntegrationManager(ctx.db, {
          accountManagers: new Map([[account.id, manager]]),
        }),
      });

      try {
        const device = await insertDevice(ctx.db, {
          provider_account_id: account.id,
          name: 'Hall litterbox',
          type: 'litterbox',
          external_id: 'lb-1',
        });

        const list = await app.inject({ method: 'GET', url: '/api/devices' });
        assert.equal(list.statusCode, 200);
        const devices = list.json();
        assert.equal(devices.length, 1);
        assert.equal(devices[0].name, 'Hall litterbox');

        const detail = await app.inject({
          method: 'GET',
          url: `/api/devices/${device.id}`,
        });
        assert.equal(detail.statusCode, 200);
        assert.equal(detail.json().external_id, 'lb-1');

        const patch = await app.inject({
          method: 'PATCH',
          url: `/api/devices/${device.id}`,
          payload: { name: 'Renamed litterbox' },
        });
        assert.equal(patch.statusCode, 200);
        assert.equal(patch.json().name, 'Renamed litterbox');
      } finally {
        await app.close();
      }
    });

    it('registers a device through the API', async () => {
      const account = await insertProviderAccount(ctx.db, {
        provider: 'inference',
        name: 'Register account',
      });
      const manager = createDeviceFriendlyAccountManager(account.id);
      const app = await createTestApp(ctx, {
        integrationManager: createTestIntegrationManager(ctx.db, {
          accountManagers: new Map([[account.id, manager]]),
        }),
      });

      try {
        const create = await app.inject({
          method: 'POST',
          url: '/api/devices',
          payload: {
            provider_account_id: account.id,
            external_id: 'lb-register-1',
            name: 'Registered litterbox',
            type: 'litterbox',
            config: { host: '192.168.1.60' },
          },
        });

        assert.equal(create.statusCode, 200);
        const device = create.json();
        assert.equal(device.name, 'Registered litterbox');
        assert.equal(device.external_id, 'lb-register-1');
        assert.equal(device.provider_account_id, account.id);
      } finally {
        await app.close();
      }
    });

    it('rejects a config patch when the provider cannot validate it', async () => {
      const account = await insertProviderAccount(ctx.db, {
        provider: 'thingino',
        name: 'Thingino account',
      });
      const manager = createDeviceFriendlyAccountManager(account.id);
      manager.validateDeviceConfig = async () => {
        throw new Error('Camera HTTP 401');
      };
      const app = await createTestApp(ctx, {
        integrationManager: createTestIntegrationManager(ctx.db, {
          accountManagers: new Map([[account.id, manager]]),
        }),
      });

      try {
        const device = await insertDevice(ctx.db, {
          provider_account_id: account.id,
          name: 'Littercam',
          type: 'camera',
          external_id: 'littercam.local',
          config: { origin: 'http://littercam.local', token: 'old-key' },
        });

        const patch = await app.inject({
          method: 'PATCH',
          url: `/api/devices/${device.id}`,
          payload: {
            name: 'Should not stick',
            config: {
              origin: 'http://littercam.local',
              token: 'wrong-key',
            },
          },
        });
        assert.equal(patch.statusCode, 400);
        assert.equal(patch.json().message, 'Camera HTTP 401');

        const detail = await app.inject({
          method: 'GET',
          url: `/api/devices/${device.id}`,
        });
        assert.equal(detail.statusCode, 200);
        assert.equal(detail.json().name, 'Littercam');
      } finally {
        await app.close();
      }
    });

    it('does not re-validate an unchanged config on patch', async () => {
      const account = await insertProviderAccount(ctx.db, {
        provider: 'thingino',
        name: 'Thingino account',
      });
      let calls = 0;
      const manager = createDeviceFriendlyAccountManager(account.id);
      manager.validateDeviceConfig = async () => {
        calls += 1;
      };
      const app = await createTestApp(ctx, {
        integrationManager: createTestIntegrationManager(ctx.db, {
          accountManagers: new Map([[account.id, manager]]),
        }),
      });

      try {
        const device = await insertDevice(ctx.db, {
          provider_account_id: account.id,
          name: 'Littercam',
          type: 'camera',
          external_id: 'littercam.local',
          config: { origin: 'http://littercam.local', token: 'kept-key' },
        });

        const patch = await app.inject({
          method: 'PATCH',
          url: `/api/devices/${device.id}`,
          payload: { name: 'Hall camera' },
        });
        assert.equal(patch.statusCode, 200);
        assert.equal(patch.json().name, 'Hall camera');
        assert.equal(calls, 0);
      } finally {
        await app.close();
      }
    });

    it('does not re-validate when the patched config serializes the same', async () => {
      const account = await insertProviderAccount(ctx.db, {
        provider: 'thingino',
        name: 'Thingino account',
      });
      let calls = 0;
      const manager = createDeviceFriendlyAccountManager(account.id);
      manager.validateDeviceConfig = async () => {
        calls += 1;
      };
      const app = await createTestApp(ctx, {
        integrationManager: createTestIntegrationManager(ctx.db, {
          accountManagers: new Map([[account.id, manager]]),
        }),
      });

      try {
        const device = await insertDevice(ctx.db, {
          provider_account_id: account.id,
          name: 'Littercam',
          type: 'camera',
          external_id: 'littercam.local',
          config: { origin: 'http://littercam.local', token: 'kept-key' },
        });

        const patch = await app.inject({
          method: 'PATCH',
          url: `/api/devices/${device.id}`,
          payload: {
            name: 'Hall camera',
            config: {
              origin: 'http://littercam.local',
              token: 'kept-key',
            },
          },
        });
        assert.equal(patch.statusCode, 200);
        assert.equal(patch.json().name, 'Hall camera');
        assert.equal(calls, 0);
      } finally {
        await app.close();
      }
    });

    it('lists remote pets when the account manager supports it', async () => {
      const account = await insertProviderAccount(ctx.db, {
        provider: 'surepet',
        name: 'SurePet account',
      });
      const manager = createStubAccountManager({
        accountId: account.id,
        listRemotePets: async () => [
          { external_id: 'cloud-cat-1', name: 'Cloud Cat' },
        ],
      });
      const app = await createTestApp(ctx, {
        integrationManager: createTestIntegrationManager(ctx.db, {
          accountManagers: new Map([[account.id, manager]]),
        }),
      });

      try {
        const res = await app.inject({
          method: 'GET',
          url: `/api/devices/accounts/${account.id}/remote-pets`,
        });

        assert.equal(res.statusCode, 200);
        const pets = res.json();
        assert.equal(pets.length, 1);
        assert.equal(pets[0].external_id, 'cloud-cat-1');
        assert.equal(pets[0].name, 'Cloud Cat');
      } finally {
        await app.close();
      }
    });

    it('links, patches, and unlinks a camera on a device', async () => {
      const account = await insertProviderAccount(ctx.db, {
        provider: 'inference',
        name: 'Camera account',
      });
      const manager = createDeviceFriendlyAccountManager(account.id);
      const app = await createTestApp(ctx, {
        integrationManager: createTestIntegrationManager(ctx.db, {
          accountManagers: new Map([[account.id, manager]]),
        }),
      });

      try {
        const litterbox = await insertDevice(ctx.db, {
          provider_account_id: account.id,
          name: 'Linked litterbox',
          type: 'litterbox',
          external_id: 'lb-cam-1',
        });
        const camera = await insertDevice(ctx.db, {
          provider_account_id: account.id,
          name: 'Hall camera',
          type: 'camera',
          external_id: 'cam-1',
        });
        const otherCamera = await insertDevice(ctx.db, {
          provider_account_id: account.id,
          name: 'Spare camera',
          type: 'camera',
          external_id: 'cam-2',
        });

        const put = await app.inject({
          method: 'PUT',
          url: `/api/devices/${litterbox.id}/camera`,
          payload: {
            camera_id: camera.id,
            config: { acquisitionTypes: ['snapshot'] },
          },
        });
        assert.equal(put.statusCode, 200);
        assert.equal(put.json().camera_link.camera_id, camera.id);
        assert.deepEqual(put.json().camera_link.config, {
          acquisitionTypes: ['snapshot'],
        });

        const replace = await app.inject({
          method: 'PUT',
          url: `/api/devices/${litterbox.id}/camera`,
          payload: { camera_id: otherCamera.id },
        });
        assert.equal(replace.statusCode, 200);
        assert.equal(replace.json().camera_link.camera_id, otherCamera.id);

        const patch = await app.inject({
          method: 'PATCH',
          url: `/api/devices/${litterbox.id}/camera`,
          payload: { config: { fetchDelay: 5 } },
        });
        assert.equal(patch.statusCode, 200);
        assert.equal(patch.json().camera_link.camera_id, otherCamera.id);
        assert.equal(patch.json().camera_link.config.fetchDelay, 5);

        const del = await app.inject({
          method: 'DELETE',
          url: `/api/devices/${litterbox.id}/camera`,
        });
        assert.equal(del.statusCode, 200);
        assert.equal(del.json().camera_link, undefined);

        const patchMissing = await app.inject({
          method: 'PATCH',
          url: `/api/devices/${litterbox.id}/camera`,
          payload: { config: { fetchDelay: 1 } },
        });
        assert.equal(patchMissing.statusCode, 404);
        const missingBody = patchMissing.json() as { message: string };
        assert.match(missingBody.message, /camera link not found/i);
      } finally {
        await app.close();
      }
    });
  });
});
