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
  EventBus,
  type MqttMessageEvent,
} from '../../src/services/devices/EventBus.ts';
import {
  startFakeBroker,
  type FakeBroker,
} from '../../src/services/devices/providers/mqtt/test/fakeBroker.ts';

describe('MqttAccountManager client identity', () => {
  let ctx: TestDbContext;
  let broker: FakeBroker;
  let integrationManager: ReturnType<typeof createTestIntegrationManager>;
  const eventBus = new EventBus();
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
    integrationManager = createTestIntegrationManager(ctx.db, { eventBus });
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

  it('subscribes to the topic prefix and fans messages onto the bus', async () => {
    const account = await insertProviderAccount(ctx.db, {
      provider: 'mqtt',
      config: { url: broker.url, topic_prefix: 'hub-a' },
    });
    accountIds.push(account.id);
    const heard: MqttMessageEvent[] = [];
    eventBus.subscribe<MqttMessageEvent>('mqtt.message', (event) =>
      heard.push(event),
    );
    await integrationManager.initializeAccount(account.id);
    await waitForConnects(4);
    for (let i = 0; i < 50 && !broker.subscriptions.includes('hub-a/#'); i++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.ok(broker.subscriptions.includes('hub-a/#'));

    broker.publish('hub-a/litterbox-1/last_event', '{"id":1}', true);
    // The fake broker pushes to every connected client, so the accounts from
    // the earlier tests hear it too, each under its own id.
    const mine = () => heard.filter((event) => event.accountId === account.id);
    for (let i = 0; i < 50 && mine().length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(mine().length, 1);
    assert.equal(mine()[0].topic, 'hub-a/litterbox-1/last_event');
    assert.equal(mine()[0].payload.toString(), '{"id":1}');
    assert.equal(mine()[0].retain, true);
  });

  it('gives two accounts on one broker different ids', async () => {
    const account = await insertProviderAccount(ctx.db, {
      provider: 'mqtt',
      config: { url: broker.url },
    });
    accountIds.push(account.id);
    await integrationManager.initializeAccount(account.id);
    await waitForConnects(5);
    assert.notEqual(broker.connects[4].clientId, broker.connects[0].clientId);
  });
});
