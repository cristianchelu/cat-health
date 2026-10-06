import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';

import type { ProviderAccountDTO, ProviderCapabilities } from 'shared';
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
import { ProviderPermanentError } from '../../src/services/devices/providerFailure.ts';
import type {
  AccountHealthReporter,
  DeviceProvider,
  ProviderAccount,
  AccountDeps,
} from '../../src/services/devices/types.ts';
import type { IntegrationManager } from '../../src/services/devices/IntegrationManager.ts';

type Step = 'ok' | Error;

/**
 * Each account plays its own script of `initialize` outcomes, keyed by name so
 * tests sharing the provider cannot consume each other's steps. A script that
 * runs out succeeds.
 */
class ScriptedProvider implements DeviceProvider {
  readonly name = 'scripted';
  readonly internal = false;
  readonly capabilities: ProviderCapabilities = {
    supported_device_types: ['feeder'],
  };
  readonly retryPolicy = { baseMs: 10, maxMs: 40 };
  readonly scripts = new Map<string, Step[]>();
  readonly starts = new Map<string, number>();
  readonly reporters = new Map<string, AccountHealthReporter[]>();
  readonly shutdowns = new Map<string, number>();

  createAccountManager(account: ProviderAccount, deps: AccountDeps) {
    const reporters = this.reporters.get(account.name) ?? [];
    reporters.push(deps.health);
    this.reporters.set(account.name, reporters);

    return createStubAccountManager({
      accountId: account.id,
      initialize: async () => {
        this.starts.set(account.name, (this.starts.get(account.name) ?? 0) + 1);
        const step = this.scripts.get(account.name)?.shift() ?? 'ok';
        if (step instanceof Error) throw step;
      },
      shutdown: async () => {
        this.shutdowns.set(
          account.name,
          (this.shutdowns.get(account.name) ?? 0) + 1,
        );
      },
      instantiateDeviceController: (device) =>
        createStubDeviceController(device),
    });
  }

  validateAccountConfig(): boolean {
    return true;
  }
}

async function waitFor(check: () => Promise<boolean>, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail('condition not met in time');
}

describe('provider account health', () => {
  let ctx: TestDbContext;
  let app: FastifyInstance;
  let integrationManager: IntegrationManager;
  const provider = new ScriptedProvider();

  before(async () => {
    ctx = await createTestDb();
    integrationManager = createTestIntegrationManager(ctx.db);
    integrationManager.registerProvider(provider);
    // Hydrates presence; with no accounts seeded yet it starts nothing.
    await integrationManager.initialize();
    app = await createTestApp(ctx, { integrationManager });
  });

  after(async () => {
    await integrationManager.shutdown();
    await app.close();
    await destroyTestDb(ctx);
  });

  async function getAccount(id: number): Promise<ProviderAccountDTO> {
    const res = await app.inject({
      method: 'GET',
      url: `/api/devices/accounts/${id}`,
    });
    assert.equal(res.statusCode, 200);
    return res.json();
  }

  async function seedAccount(name: string, script: Step[]) {
    provider.scripts.set(name, script);
    return insertProviderAccount(ctx.db, { provider: 'scripted', name });
  }

  async function start(id: number) {
    return app.inject({
      method: 'POST',
      url: `/api/devices/accounts/${id}/reload`,
    });
  }

  it('retries a failed start until it comes up', async () => {
    const account = await seedAccount('flaky', [
      new TypeError('fetch failed', {
        cause: new Error('getaddrinfo EAI_AGAIN'),
      }),
      new Error('still down'),
    ]);

    const res = await start(account.id);
    assert.equal(res.statusCode, 200);
    const first = res.json<ProviderAccountDTO>().health;
    assert.equal(first?.state, 'unavailable');
    assert.equal(first?.attempts, 1);
    assert.equal(first?.reason, 'fetch failed (getaddrinfo EAI_AGAIN)');
    assert.ok(first?.next_retry_at);

    await waitFor(
      async () => (await getAccount(account.id)).health?.state === 'ok',
    );
    assert.equal(provider.starts.get('flaky'), 3);
    const health = (await getAccount(account.id)).health;
    assert.equal(health?.attempts, undefined);
    assert.equal(health?.next_retry_at, undefined);
  });

  it('stops on a permanent error', async () => {
    const account = await seedAccount('locked-out', [
      new ProviderPermanentError('login rejected (401)'),
    ]);

    const health = (await start(account.id)).json<ProviderAccountDTO>().health;
    assert.equal(health?.state, 'failed');
    assert.equal(health?.reason, 'login rejected (401)');
    assert.equal(health?.next_retry_at, undefined);

    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(provider.starts.get('locked-out'), 1);
  });

  it('recovers a failed account on reload', async () => {
    const account = await seedAccount('fixed-by-hand', [
      new ProviderPermanentError('login rejected (401)'),
    ]);
    await start(account.id);

    const health = (await start(account.id)).json<ProviderAccountDTO>().health;
    assert.equal(health?.state, 'ok');
  });

  it('takes the account offline with it, and back', async () => {
    const account = await seedAccount('with-feeder', []);
    const device = await insertDevice(ctx.db, {
      provider_account_id: account.id,
      type: 'feeder',
      external_id: 'feeder-health',
    });
    await start(account.id);

    const [reporter] = provider.reporters.get('with-feeder') ?? [];
    provider.scripts.set('with-feeder', [new Error('cloud gone')]);
    reporter.fail(new Error('cloud gone'));

    await waitFor(async () => {
      const row = await ctx.db
        .selectFrom('device')
        .select('status')
        .where('id', '=', device.id)
        .executeTakeFirstOrThrow();
      return row.status === 'offline';
    });
    assert.equal(provider.shutdowns.get('with-feeder'), 1);

    const res = await app.inject({
      method: 'GET',
      url: `/api/devices/${device.id}`,
    });
    assert.equal(res.json().account_health_state, 'unavailable');

    await waitFor(
      async () => (await getAccount(account.id)).health?.state === 'ok',
    );
  });

  it('ignores a failure reported by a manager it already replaced', async () => {
    const account = await seedAccount('replaced', []);
    await start(account.id);
    await start(account.id);

    const [stale] = provider.reporters.get('replaced') ?? [];
    stale.fail(new Error('late news'));
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.equal((await getAccount(account.id)).health?.state, 'ok');
  });

  it('saves an edit whose start fails instead of answering 500', async () => {
    const account = await seedAccount('edited', [new Error('unreachable')]);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/devices/accounts/${account.id}`,
      payload: { name: 'edited' },
    });
    assert.equal(res.statusCode, 200);
  });

  it('reports no health for a disabled account', async () => {
    const account = await seedAccount('switched-off', []);
    await start(account.id);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/devices/accounts/${account.id}`,
      payload: { enabled: false },
    });
    assert.equal(res.json<ProviderAccountDTO>().health, null);
    assert.equal((await start(account.id)).statusCode, 400);
  });
});
