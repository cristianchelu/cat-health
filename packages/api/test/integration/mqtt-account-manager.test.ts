import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { insertProviderAccount } from '../helpers/fixtures.ts';
import { createTestIntegrationManager } from '../helpers/integrationManager.ts';
import {
  createTestDb,
  destroyTestDb,
  type TestDbContext,
} from '../helpers/testDb.ts';
import { MqttProvider } from '../../src/services/devices/providers/mqtt/MqttProvider.ts';
import {
  startFakeBroker,
  type FakeBroker,
} from '../../src/services/devices/providers/mqtt/test/fakeBroker.ts';

describe('MqttAccountManager client identity', () => {
  let ctx: TestDbContext;
  let broker: FakeBroker;
  let integrationManager: ReturnType<typeof createTestIntegrationManager>;
  const accountIds: number[] = [];

  const readRuntime = async (id: number) => {
    const row = await ctx.db
      .selectFrom('provider_account')
      .select('runtime_state')
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    return typeof row.runtime_state === 'string'
      ? JSON.parse(row.runtime_state)
      : row.runtime_state;
  };

  const waitForConnects = async (count: number) => {
    for (let i = 0; i < 50 && broker.connects.length < count; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(broker.connects.length, count);
  };

  before(async () => {
    ctx = await createTestDb();
    broker = await startFakeBroker({ answer: () => 0 });
    integrationManager = createTestIntegrationManager(ctx.db);
    integrationManager.registerProvider(new MqttProvider());
  });

  after(async () => {
    for (const id of accountIds) {
      await integrationManager.getAccountManager(id)?.shutdown();
    }
    await broker.close();
    await destroyTestDb(ctx);
  });

  it('mints a client id once and reuses it across restarts', async () => {
    const account = await insertProviderAccount(ctx.db, {
      provider: 'mqtt',
      config: { url: broker.url },
    });
    accountIds.push(account.id);
    await integrationManager.initializeAccount(account.id);
    await waitForConnects(1);

    const minted = broker.connects[0].clientId;
    assert.match(minted, /^cat-health-[0-9a-f]{6}$/);
    assert.equal((await readRuntime(account.id)).client_id, minted);

    await integrationManager.initializeAccount(account.id);
    await waitForConnects(2);
    assert.equal(broker.connects[1].clientId, minted);
  });

  it('honours a fixed client id without persisting one', async () => {
    const account = await insertProviderAccount(ctx.db, {
      provider: 'mqtt',
      config: { url: broker.url, client_id: 'hub-fixed' },
    });
    accountIds.push(account.id);
    await integrationManager.initializeAccount(account.id);
    await waitForConnects(3);
    assert.equal(broker.connects[2].clientId, 'hub-fixed');
    assert.equal((await readRuntime(account.id)).client_id, undefined);
  });

  it('gives two accounts on one broker different ids', async () => {
    const account = await insertProviderAccount(ctx.db, {
      provider: 'mqtt',
      config: { url: broker.url },
    });
    accountIds.push(account.id);
    await integrationManager.initializeAccount(account.id);
    await waitForConnects(4);
    assert.notEqual(broker.connects[3].clientId, broker.connects[0].clientId);
  });
});
