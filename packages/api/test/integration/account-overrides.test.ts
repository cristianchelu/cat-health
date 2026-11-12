import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { insertProviderAccount } from '../helpers/fixtures.ts';
import { createTestIntegrationManager } from '../helpers/integrationManager.ts';
import {
  createTestDb,
  destroyTestDb,
  type TestDbContext,
} from '../helpers/testDb.ts';
import {
  startFakeBroker,
  type FakeBroker,
} from '../../src/services/devices/providers/mqtt/test/fakeBroker.ts';

describe('IntegrationManager account overrides', () => {
  let ctx: TestDbContext;
  let broker: FakeBroker;
  let integrationManager: ReturnType<typeof createTestIntegrationManager>;
  let overridden: number;
  let broken: number;

  const waitForConnects = async (count: number) => {
    for (let i = 0; i < 50 && broker.connects.length < count; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(broker.connects.length, count);
  };

  before(async () => {
    ctx = await createTestDb();
    broker = await startFakeBroker({ answer: () => 0 });
    overridden = (
      await insertProviderAccount(ctx.db, {
        provider: 'mqtt',
        config: { url: broker.url, client_id: 'live-hub' },
      })
    ).id;
    broken = (
      await insertProviderAccount(ctx.db, {
        provider: 'mqtt',
        config: { url: broker.url },
      })
    ).id;
    integrationManager = createTestIntegrationManager(ctx.db, {
      accountOverrides: {
        [overridden]: { config: { client_id: 'dev-laptop' } },
        [broken]: { config: { url: '' } },
      },
    });
  });

  after(async () => {
    for (const id of [overridden, broken]) {
      await integrationManager.getAccountManager(id)?.shutdown();
    }
    await broker.close();
    await destroyTestDb(ctx);
  });

  it('starts the account with the overridden config', async () => {
    await integrationManager.initializeAccount(overridden);
    await waitForConnects(1);
    assert.equal(broker.connects[0].clientId, 'dev-laptop');
  });

  it('keeps the stored config as it was', async () => {
    const row = await ctx.db
      .selectFrom('provider_account')
      .select('config')
      .where('id', '=', overridden)
      .executeTakeFirstOrThrow();
    const config =
      typeof row.config === 'string' ? JSON.parse(row.config) : row.config;
    assert.equal(config.client_id, 'live-hub');
  });

  it('fails an account whose override leaves an invalid config', async () => {
    await integrationManager.initializeAccount(broken);
    const health = integrationManager.getAccountHealth(broken);
    assert.equal(health?.state, 'failed');
    assert.match(health?.reason ?? '', /Account override for \d+/);
  });
});
