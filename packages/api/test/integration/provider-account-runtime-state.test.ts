import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';

import { isRecord } from 'shared';
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
}

describe('provider account config / runtime_state split', () => {
  let ctx: TestDbContext;
  let app: FastifyInstance;

  const readRow = (id: number) =>
    ctx.db
      .selectFrom('provider_account')
      .select(['config', 'runtime_state'])
      .where('id', '=', id)
      .executeTakeFirstOrThrow();

  before(async () => {
    ctx = await createTestDb();
    const integrationManager = createTestIntegrationManager(ctx.db);
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
