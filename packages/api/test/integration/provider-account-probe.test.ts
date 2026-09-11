import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';

import { isRecord, type ProviderCapabilities } from 'shared';
import { createStubAccountManager } from '../helpers/accountManagerDoubles.ts';
import { insertProviderAccount } from '../helpers/fixtures.ts';
import { createTestIntegrationManager } from '../helpers/integrationManager.ts';
import {
  createTestApp,
  createTestDb,
  destroyTestDb,
  type TestDbContext,
} from '../helpers/testDb.ts';
import type {
  DeviceProvider,
  ProviderAccount,
} from '../../src/services/devices/types.ts';

/**
 * Stands in for a provider whose account is a live connection (a broker, a
 * cloud login). Only `host: 'reachable.example'` answers.
 */
class ProbingProvider implements DeviceProvider {
  readonly name = 'probing';
  readonly internal = false;
  readonly capabilities: ProviderCapabilities = { supported_device_types: [] };
  probes = 0;

  createAccountManager(account: ProviderAccount) {
    return createStubAccountManager({ accountId: account.id });
  }

  validateAccountConfig(config: unknown): boolean {
    return isRecord(config) && typeof config.host === 'string';
  }

  async probeAccountConfig(config: unknown): Promise<void> {
    this.probes += 1;
    const host = isRecord(config) ? config.host : undefined;
    if (host !== 'reachable.example') {
      throw new Error(`Cannot reach ${String(host)}`);
    }
  }
}

/** A provider with nothing to reach; its writes must go through untouched. */
class UnprobedProvider implements DeviceProvider {
  readonly name = 'unprobed';
  readonly internal = false;
  readonly capabilities: ProviderCapabilities = {};
  createAccountManager(account: ProviderAccount) {
    return createStubAccountManager({ accountId: account.id });
  }
  validateAccountConfig(): boolean {
    return true;
  }
}

describe('provider account connection probes', () => {
  let ctx: TestDbContext;
  let app: FastifyInstance;
  const probing = new ProbingProvider();

  before(async () => {
    ctx = await createTestDb();
    const integrationManager = createTestIntegrationManager(ctx.db);
    integrationManager.registerProvider(probing);
    integrationManager.registerProvider(new UnprobedProvider());
    app = await createTestApp(ctx, { integrationManager });
  });

  after(async () => {
    await app.close();
    await destroyTestDb(ctx);
  });

  describe('probe before write', () => {
    it('does not create an account the remote refuses', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/devices/accounts',
        payload: {
          provider: 'probing',
          name: 'Dark',
          config: { host: 'dark.example' },
        },
      });
      assert.equal(res.statusCode, 400);
      assert.equal(res.json().message, 'Cannot reach dark.example');
      const rows = await ctx.db
        .selectFrom('provider_account')
        .select('id')
        .where('name', '=', 'Dark')
        .execute();
      assert.equal(rows.length, 0);
    });

    it('creates an account the remote accepts', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/devices/accounts',
        payload: {
          provider: 'probing',
          name: 'Lit',
          config: { host: 'reachable.example' },
        },
      });
      assert.equal(res.statusCode, 200);
    });

    it('keeps the stored config when an edit is refused', async () => {
      const account = await insertProviderAccount(ctx.db, {
        provider: 'probing',
        name: 'Edited',
        config: { host: 'reachable.example' },
      });
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/devices/accounts/${account.id}`,
        payload: { config: { host: 'dark.example' } },
      });
      assert.equal(res.statusCode, 400);
      const row = await ctx.db
        .selectFrom('provider_account')
        .select('config')
        .where('id', '=', account.id)
        .executeTakeFirstOrThrow();
      const config =
        typeof row.config === 'string' ? JSON.parse(row.config) : row.config;
      assert.deepEqual(config, { host: 'reachable.example' });
    });

    it('skips the probe when only the name changes', async () => {
      const account = await insertProviderAccount(ctx.db, {
        provider: 'probing',
        name: 'Renamed',
        config: { host: 'reachable.example' },
      });
      const before = probing.probes;
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/devices/accounts/${account.id}`,
        payload: { name: 'Renamed twice' },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(probing.probes, before);
    });

    it('lets providers without a probe create accounts as before', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/devices/accounts',
        payload: { provider: 'unprobed', name: 'Plain', config: {} },
      });
      assert.equal(res.statusCode, 200);
    });
  });
});
