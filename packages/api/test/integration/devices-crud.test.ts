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
  });
});
