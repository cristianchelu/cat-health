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

/** CONNACK 5 in MQTT 3.1.1: not authorized. */
const NOT_AUTHORIZED = 5;

describe('MQTT account health', () => {
  let ctx: TestDbContext;
  let broker: FakeBroker;
  let integrationManager: ReturnType<typeof createTestIntegrationManager>;

  before(async () => {
    ctx = await createTestDb();
    broker = await startFakeBroker({
      answer: (packet) => (packet.username === 'intruder' ? NOT_AUTHORIZED : 0),
    });
    integrationManager = createTestIntegrationManager(ctx.db);
  });

  after(async () => {
    await integrationManager.shutdown();
    await broker.close();
    await destroyTestDb(ctx);
  });

  const waitForState = async (accountId: number, state: string) => {
    for (let i = 0; i < 100; i += 1) {
      if (integrationManager.getAccountHealth(accountId)?.state === state) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(integrationManager.getAccountHealth(accountId)?.state, state);
  };

  it('stays up while the broker accepts it', async () => {
    const account = await insertProviderAccount(ctx.db, {
      provider: 'mqtt',
      config: { url: broker.url },
    });
    await integrationManager.initializeAccount(account.id);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(integrationManager.getAccountHealth(account.id)?.state, 'ok');
  });

  it('stops for good when the broker refuses the credentials', async () => {
    const account = await insertProviderAccount(ctx.db, {
      provider: 'mqtt',
      config: { url: broker.url, username: 'intruder', password: 'guess' },
    });
    await integrationManager.initializeAccount(account.id);

    await waitForState(account.id, 'failed');
    const health = integrationManager.getAccountHealth(account.id);
    assert.match(health?.reason ?? '', /Not authorized/i);
    assert.equal(health?.next_retry_at, undefined);
  });

  it('hands an unreachable broker to the backoff', async () => {
    const account = await insertProviderAccount(ctx.db, {
      provider: 'mqtt',
      // Nothing listens on the discard port.
      config: { url: 'mqtt://127.0.0.1:9' },
    });
    await integrationManager.initializeAccount(account.id);

    await waitForState(account.id, 'unavailable');
    const health = integrationManager.getAccountHealth(account.id);
    assert.equal(health?.attempts, 1);
    assert.ok(health?.next_retry_at);
  });
});
