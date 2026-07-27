import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';

import { isRecord } from 'shared';
import { createStubAccountManager } from '../helpers/accountManagerDoubles.ts';
import { insertDevice, insertProviderAccount } from '../helpers/fixtures.ts';
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
 * `provider_account` keeps user-supplied settings in `config` and
 * provider-managed state (auth tokens, cached ids, sync cursors) in
 * `runtime_state`.
 *
 * Before the split both lived in one blob, so the UI had to round-trip secrets
 * through a JSON textarea to avoid destroying them on save, and a background
 * token refresh could silently revert a concurrent user edit.
 *
 * These tests cover the generic route wiring. A stand-in provider stands in for
 * the real cloud ones so nothing here touches the network; the SurePet-specific
 * reconciliation rules are unit-tested in
 * `src/services/devices/providers/surepet/test/reconcileRuntimeState.test.ts`.
 */
class TestCloudProvider implements DeviceProvider {
  readonly name = 'test-cloud';
  readonly internal = false;
  readonly capabilities = { supports_discovery: true } as const;

  createAccountManager(account: ProviderAccount) {
    return createStubAccountManager({ accountId: account.id });
  }

  validateAccountConfig(config: unknown): boolean {
    if (!isRecord(config)) return false;
    return (
      typeof config.username === 'string' &&
      config.username.length > 0 &&
      typeof config.password === 'string' &&
      config.password.length > 0
    );
  }

  reconcileRuntimeState({
    previousConfig,
    nextConfig,
    runtimeState,
  }: {
    previousConfig: unknown;
    nextConfig: unknown;
    runtimeState: unknown;
  }): Record<string, unknown> {
    const prev = isRecord(previousConfig) ? previousConfig : {};
    const next = isRecord(nextConfig) ? nextConfig : {};
    const runtime = isRecord(runtimeState) ? { ...runtimeState } : {};

    if (prev.username !== next.username || prev.password !== next.password) {
      delete runtime.token;
    }
    return runtime;
  }

  /** Stands in for "this config key selects which remote account we talk to". */
  validateAccountConfigChange({
    previousConfig,
    nextConfig,
    registeredDeviceCount,
  }: {
    previousConfig: unknown;
    nextConfig: unknown;
    registeredDeviceCount: number;
  }): string | null {
    if (registeredDeviceCount === 0) return null;
    const prev = isRecord(previousConfig) ? previousConfig : {};
    const next = isRecord(nextConfig) ? nextConfig : {};
    if (prev.username === next.username) return null;
    return `Cannot change the username while ${registeredDeviceCount} device(s) are registered`;
  }
}

describe('provider account config / runtime_state split', () => {
  let ctx: TestDbContext;
  let app: FastifyInstance;
  let integrationManager: ReturnType<typeof createTestIntegrationManager>;

  const readRow = (id: number) =>
    ctx.db
      .selectFrom('provider_account')
      .select(['config', 'runtime_state', 'name', 'enabled'])
      .where('id', '=', id)
      .executeTakeFirstOrThrow();

  before(async () => {
    ctx = await createTestDb();
    integrationManager = createTestIntegrationManager(ctx.db);
    integrationManager.registerProvider(new TestCloudProvider());
    app = await createTestApp(ctx, { integrationManager });
  });

  after(async () => {
    await app.close();
    await destroyTestDb(ctx);
  });

  it('leaves runtime_state untouched when config changes elsewhere', async () => {
    const account = await insertProviderAccount(ctx.db, {
      provider: 'test-cloud',
      name: 'Casa Whiskers',
      config: { username: 'you', password: 'original' },
      runtime_state: {
        install_id: 'install-uuid',
        token: 'jwt',
        cursor: { since: 55 },
      },
    });

    // Editing only pet links must not disturb any runtime state — not even the
    // sync cursor, or the next poll re-ingests the entire history.
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/devices/accounts/${account.id}`,
      payload: {
        config: {
          username: 'you',
          password: 'original',
          pet_links: [{ external_pet_id: '1', pet_id: 7 }],
        },
      },
    });
    assert.equal(res.statusCode, 200);

    const row = await readRow(account.id);
    assert.deepEqual(row.runtime_state, {
      install_id: 'install-uuid',
      token: 'jwt',
      cursor: { since: 55 },
    });
    assert.deepEqual(row.config, {
      username: 'you',
      password: 'original',
      pet_links: [{ external_pet_id: '1', pet_id: 7 }],
    });
  });

  it('persists what the provider decides to keep after a credential change', async () => {
    const account = await insertProviderAccount(ctx.db, {
      provider: 'test-cloud',
      name: 'Rotated',
      config: { username: 'you', password: 'old' },
      runtime_state: { install_id: 'install-uuid', token: 'stale-jwt' },
    });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/devices/accounts/${account.id}`,
      payload: { config: { username: 'you', password: 'rotated' } },
    });
    assert.equal(res.statusCode, 200);

    assert.deepEqual((await readRow(account.id)).runtime_state, {
      install_id: 'install-uuid',
    });
  });

  it('never exposes runtime state to the client', async () => {
    const account = await insertProviderAccount(ctx.db, {
      provider: 'test-cloud',
      name: 'Secretive',
      config: { username: 'you', password: 'pw' },
      runtime_state: { install_id: 'install-uuid', token: 'jwt' },
    });

    for (const url of [
      `/api/devices/accounts/${account.id}`,
      '/api/devices/accounts',
    ]) {
      const res = await app.inject({ method: 'GET', url });
      assert.equal(res.statusCode, 200);
      assert.ok(
        !res.body.includes('runtime_state'),
        `${url} leaked runtime_state`,
      );
      assert.ok(!res.body.includes('jwt'), `${url} leaked the bearer token`);
      assert.ok(!res.body.includes('install-uuid'), `${url} leaked install_id`);
    }
  });

  it('ignores runtime keys smuggled in through config', async () => {
    const account = await insertProviderAccount(ctx.db, {
      provider: 'test-cloud',
      name: 'Smuggler',
      config: { username: 'you', password: 'pw' },
      runtime_state: { token: 'real-token' },
    });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/devices/accounts/${account.id}`,
      payload: {
        config: { username: 'you', password: 'pw', token: 'attacker-token' },
      },
    });
    assert.equal(res.statusCode, 200);

    const runtime = (await readRow(account.id)).runtime_state as Record<
      string,
      unknown
    >;
    assert.equal(
      runtime.token,
      'real-token',
      'a client-supplied token must not reach runtime_state',
    );
  });

  it('rejects a config the provider considers invalid, writing nothing', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/devices/accounts',
      payload: {
        provider: 'test-cloud',
        name: 'No credentials',
        config: { username: 'you' },
      },
    });
    assert.equal(create.statusCode, 400);

    const account = await insertProviderAccount(ctx.db, {
      provider: 'test-cloud',
      name: 'Valid',
      config: { username: 'you', password: 'pw' },
    });
    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/devices/accounts/${account.id}`,
      payload: { config: { username: '', password: '' } },
    });
    assert.equal(patch.statusCode, 400);

    assert.deepEqual(
      (await readRow(account.id)).config,
      { username: 'you', password: 'pw' },
      'a rejected PATCH must not have written anything',
    );
  });

  it('ignores runtime keys smuggled in through config on create', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/devices/accounts',
      payload: {
        provider: 'test-cloud',
        name: 'Fresh smuggler',
        config: { username: 'you', password: 'pw', token: 'attacker-token' },
      },
    });
    assert.equal(create.statusCode, 200);

    const created = await readRow(create.json().id as number);
    assert.deepEqual(
      created.runtime_state,
      {},
      'a new account starts with empty runtime state whatever config says',
    );
  });

  it('does not rewrite runtime_state when only name / enabled change', async () => {
    const account = await insertProviderAccount(ctx.db, {
      provider: 'test-cloud',
      name: 'Renamed',
      config: { username: 'you', password: 'pw' },
      runtime_state: { token: 'jwt', cursor: { since: 9 } },
    });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/devices/accounts/${account.id}`,
      payload: { name: 'Renamed twice', enabled: false },
    });
    assert.equal(res.statusCode, 200);

    const row = await readRow(account.id);
    assert.equal(row.name, 'Renamed twice');
    assert.equal(row.enabled, 0);
    assert.deepEqual(row.runtime_state, { token: 'jwt', cursor: { since: 9 } });
  });

  it('refuses a config edit the provider says would orphan devices', async () => {
    const account = await insertProviderAccount(ctx.db, {
      provider: 'test-cloud',
      name: 'Wired up',
      config: { username: 'you', password: 'pw' },
      runtime_state: { token: 'jwt' },
    });
    await insertDevice(ctx.db, {
      provider_account_id: account.id,
      external_id: 'remote-1',
    });

    const rejected = await app.inject({
      method: 'PATCH',
      url: `/api/devices/accounts/${account.id}`,
      payload: { config: { username: 'someone-else', password: 'pw' } },
    });
    assert.equal(rejected.statusCode, 400);
    assert.match(rejected.json().message, /1 device/);
    assert.deepEqual(
      (await readRow(account.id)).config,
      { username: 'you', password: 'pw' },
      'a refused PATCH must not have written anything',
    );

    // The same account may still rotate its password.
    const allowed = await app.inject({
      method: 'PATCH',
      url: `/api/devices/accounts/${account.id}`,
      payload: { config: { username: 'you', password: 'rotated' } },
    });
    assert.equal(allowed.statusCode, 200);
  });

  it('keeps runtime state for a provider with no reconcile hook', async () => {
    // esphome implements neither hook, so the fallback must return the stored
    // state untouched — and normalize a non-object one instead of echoing it.
    assert.deepEqual(
      integrationManager.reconcileRuntimeState('esphome', {
        previousConfig: { host: 'a' },
        nextConfig: { host: 'b' },
        runtimeState: { cursor: 9 },
      }),
      { cursor: 9 },
    );
    assert.deepEqual(
      integrationManager.reconcileRuntimeState('esphome', {
        previousConfig: {},
        nextConfig: {},
        runtimeState: [],
      }),
      {},
      'an array runtime_state must not be echoed back and re-persisted as []',
    );
    assert.deepEqual(
      integrationManager.reconcileRuntimeState('nonesuch', {
        previousConfig: {},
        nextConfig: {},
        runtimeState: { cursor: 9 },
      }),
      { cursor: 9 },
    );

    // And no hook means no veto either.
    assert.equal(
      await integrationManager.validateAccountConfigChange(1, 'esphome', {
        previousConfig: { host: 'a' },
        nextConfig: { host: 'b' },
      }),
      null,
    );
  });

  it('answers 404 for an account that does not exist', async () => {
    for (const method of ['GET', 'PATCH'] as const) {
      const res = await app.inject({
        method,
        url: '/api/devices/accounts/999999',
        ...(method === 'PATCH' ? { payload: { name: 'Ghost' } } : {}),
      });
      assert.equal(res.statusCode, 404, `${method} should be 404, not 500`);
      assert.equal(res.json().error, 'Not Found');
    }
  });

  it('rejects an account for an unregistered provider', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/devices/accounts',
      payload: { provider: 'nonesuch', name: 'Ghost', config: {} },
    });
    assert.equal(res.statusCode, 400);
  });

  it('defaults runtime_state to an empty object on create', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/devices/accounts',
      payload: { provider: 'esphome', name: 'Fresh', config: {} },
    });
    assert.equal(create.statusCode, 200);

    assert.deepEqual((await readRow(create.json().id as number)).runtime_state, {});
  });
});
