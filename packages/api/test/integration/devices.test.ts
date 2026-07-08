import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';

import {
  createTestApp,
  createTestDb,
  destroyTestDb,
  type TestDbContext,
} from '../helpers/testDb.ts';
import { createTestIntegrationManager } from '../helpers/integrationManager.ts';
import {
  createDiscoverableAccountManager,
  createMockIntegrationManager,
  createStubAccountManager,
} from '../helpers/mockIntegrationManager.ts';
import { insertProviderAccount } from '../helpers/fixtures.ts';

describe('devices API', () => {
  describe('providers', () => {
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

    it('lists registered providers with capability flags', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/devices/providers' });
      assert.equal(res.statusCode, 200);

      const providers = res.json() as Array<{
        name: string;
        capabilities: Record<string, unknown>;
      }>;

      const byName = new Map(providers.map((provider) => [provider.name, provider]));
      assert.ok(byName.has('esphome'));
      assert.equal(byName.get('esphome')?.capabilities.supports_discovery, true);
      assert.ok(byName.has('surepet'));
      assert.equal(byName.get('surepet')?.capabilities.supports_pet_linking, true);
      assert.ok(byName.has('inference'));
      assert.equal(byName.get('inference')?.capabilities.skip_discovery, true);
    });
  });

  describe('account discovery', () => {
    let ctx: TestDbContext;

    before(async () => {
      ctx = await createTestDb();
    });

    after(async () => {
      await destroyTestDb(ctx);
    });

    it('returns discovered devices when the account manager supports discovery', async () => {
      const manager = createDiscoverableAccountManager([
        {
          externalId: 'lb-test-1',
          name: 'Hall litterbox',
          type: 'litterbox',
          config: { host: '192.168.1.50' },
        },
      ]);

      const app = await createTestApp(ctx, {
        integrationManager: createMockIntegrationManager({
          accountManagers: new Map([[1, manager]]),
        }),
      });

      try {
        const res = await app.inject({
          method: 'GET',
          url: '/api/devices/accounts/1/discover',
        });

        assert.equal(res.statusCode, 200);
        const devices = res.json();
        assert.equal(devices.length, 1);
        assert.equal(devices[0].externalId, 'lb-test-1');
        assert.equal(devices[0].name, 'Hall litterbox');
      } finally {
        await app.close();
      }
    });

    it('fails when the account manager is not registered', async () => {
      const app = await createTestApp(ctx, {
        integrationManager: createMockIntegrationManager(),
      });

      try {
        const res = await app.inject({
          method: 'GET',
          url: '/api/devices/accounts/99/discover',
        });

        assert.equal(res.statusCode, 500);
      } finally {
        await app.close();
      }
    });

    it('fails when remote pet listing is not supported', async () => {
      const account = await insertProviderAccount(ctx.db, { provider: 'esphome' });
      const manager = createStubAccountManager({ accountId: account.id });
      const app = await createTestApp(ctx, {
        integrationManager: createMockIntegrationManager({
          accountManagers: new Map([[account.id, manager]]),
        }),
      });

      try {
        const res = await app.inject({
          method: 'GET',
          url: `/api/devices/accounts/${account.id}/remote-pets`,
        });

        assert.equal(res.statusCode, 500);
      } finally {
        await app.close();
      }
    });
  });
});
