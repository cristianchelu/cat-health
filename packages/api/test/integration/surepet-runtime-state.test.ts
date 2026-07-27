import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import { EventBus } from '../../src/services/devices/EventBus.ts';
import { DevicePresence } from '../../src/services/devices/DevicePresence.ts';
import { MediaManager } from '../../src/services/media/MediaManager.ts';
import { recordDeviceEvent } from '../../src/services/events/recordDeviceEvent.ts';
import { SurePetAccountManager } from '../../src/services/devices/providers/surepet/SurePetAccountManager.ts';
import {
  SUREPET_API_BASE,
  SUREPET_LOGIN_URL,
  SUREPET_ME_START_URL,
} from '../../src/services/devices/providers/surepet/constants.ts';
import type { ProviderDeps } from '../../src/services/devices/types.ts';
import { insertProviderAccount } from '../helpers/fixtures.ts';
import {
  createTestDb,
  destroyTestDb,
  type TestDbContext,
} from '../helpers/testDb.ts';

/** Long enough and printable, so `tokenSeemsValid()` accepts it. */
const STORED_TOKEN = `stored.${'x'.repeat(340)}`;
const FRESH_TOKEN = `fresh.${'y'.repeat(340)}`;

const CONFIG = {
  email: 'you@example.com',
  password: 'pw',
  pet_links: [{ external_pet_id: '1', pet_id: 7 }],
};

interface FetchLog {
  calls: string[];
}

function mockSurePetCloud(): FetchLog {
  const log: FetchLog = { calls: [] };

  mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = String(input);
    log.calls.push(url);

    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

    if (url === SUREPET_LOGIN_URL)
      return json({ data: { token: FRESH_TOKEN } });
    if (url === SUREPET_ME_START_URL) {
      return json({ data: { households: [{ id: 42 }] } });
    }
    if (url.startsWith(`${SUREPET_API_BASE}/device`)) return json({ data: [] });
    throw new Error(`unexpected SurePet request: ${url}`);
  });

  return log;
}

function buildDeps(ctx: TestDbContext): ProviderDeps {
  const eventBus = new EventBus();
  const db = ctx.db;
  return {
    db,
    eventBus,
    mediaManager: new MediaManager(db),
    directory: {
      instantiateController: async () => undefined,
      getLinkedCamera: async () => undefined,
    },
    presence: new DevicePresence({
      db,
      eventBus,
      recordDeviceEvent: (input) => recordDeviceEvent({ db, eventBus }, input),
    }),
    logger: console,
  };
}

/**
 * The point of splitting `config` from `runtime_state` is that provider
 * background work and user edits can no longer clobber each other. These tests
 * hold that invariant from the provider side: a token refresh writes exactly one
 * column, and a manager that has been replaced writes nothing at all.
 */
describe('SurePetAccountManager runtime state persistence', () => {
  const contexts: TestDbContext[] = [];

  const setup = async (runtimeState: Record<string, unknown>) => {
    const ctx = await createTestDb();
    contexts.push(ctx);
    const account = await insertProviderAccount(ctx.db, {
      provider: 'surepet',
      name: 'Casa Whiskers',
      config: CONFIG,
      runtime_state: runtimeState,
    });
    const log = mockSurePetCloud();
    const manager = new SurePetAccountManager(account, buildDeps(ctx));
    return { ctx, account, manager, log };
  };

  const readAccount = (ctx: TestDbContext, id: number) =>
    ctx.db
      .selectFrom('provider_account')
      .select(['config', 'runtime_state', 'updated_at', 'name'])
      .where('id', '=', id)
      .executeTakeFirstOrThrow();

  afterEach(async () => {
    mock.restoreAll();
    while (contexts.length) {
      const ctx = contexts.pop();
      if (ctx) await destroyTestDb(ctx);
    }
  });

  it('reuses a stored token instead of logging in again', async () => {
    const { ctx, account, manager, log } = await setup({
      device_id: 'install-uuid',
      token: STORED_TOKEN,
      household_id: 42,
      sync: { last_timeline_since_id: 55 },
    });

    await manager.discoverDevices();

    assert.ok(
      !log.calls.includes(SUREPET_LOGIN_URL),
      'a token that still looks valid must not trigger a network login',
    );
    const row = await readAccount(ctx, account.id);
    assert.deepEqual(
      row.runtime_state,
      {
        device_id: 'install-uuid',
        token: STORED_TOKEN,
        household_id: 42,
        sync: { last_timeline_since_id: 55 },
      },
      'nothing changed, so nothing should have been written',
    );
    assert.equal(row.updated_at, account.updated_at);
  });

  it('persists a fresh token without touching config or updated_at', async () => {
    const { ctx, account, manager, log } = await setup({});

    await manager.discoverDevices();

    assert.equal(
      log.calls.filter((url) => url === SUREPET_LOGIN_URL).length,
      1,
      'exactly one login when there is no usable stored token',
    );

    const row = await readAccount(ctx, account.id);
    const runtime = row.runtime_state as Record<string, unknown>;
    assert.equal(runtime.token, FRESH_TOKEN);
    assert.equal(runtime.household_id, 42);
    assert.equal(
      typeof runtime.device_id,
      'string',
      'the install identity is minted and persisted',
    );

    // The headline invariant of the split: a background token refresh cannot
    // revert a concurrent user edit, and does not look like one either.
    assert.deepEqual(row.config, CONFIG);
    assert.equal(row.updated_at, account.updated_at);
  });

  it('salvages the sync cursor from a partly corrupt runtime state', async () => {
    // A single bad field used to discard the whole blob, and losing the cursor
    // makes the next sync re-pull the household report plus the full timeline.
    const { ctx, account, manager } = await setup({
      device_id: 'install-uuid',
      token: 42,
      household_id: 'nope',
      sync: { last_timeline_since_id: 55 },
    });

    await manager.discoverDevices();

    assert.deepEqual((await readAccount(ctx, account.id)).runtime_state, {
      device_id: 'install-uuid',
      token: FRESH_TOKEN,
      household_id: 42,
      sync: { last_timeline_since_id: 55 },
    });
  });

  it('keeps the install identity stable when the login fails', async () => {
    const { ctx, account, manager } = await setup({});
    mock.restoreAll();
    mock.method(
      globalThis,
      'fetch',
      async () => new Response('{}', { status: 401 }),
    );

    await assert.rejects(() => manager.discoverDevices());

    const runtime = (await readAccount(ctx, account.id))
      .runtime_state as Record<string, unknown>;
    assert.equal(
      typeof runtime.device_id,
      'string',
      'a wrong password must not cost a new SurePet client identity every restart',
    );
    assert.equal(runtime.token, undefined);
  });

  it('cannot resurrect stale state after being shut down', async () => {
    const { ctx, account, manager } = await setup({
      device_id: 'install-uuid',
      token: STORED_TOKEN,
      household_id: 42,
      sync: { last_timeline_since_id: 55 },
    });

    // PATCH of the credentials: the manager is retired and the route writes the
    // reconciled runtime state.
    await manager.shutdown();
    await ctx.db
      .updateTable('provider_account')
      .set({ runtime_state: { device_id: 'install-uuid' } })
      .where('id', '=', account.id)
      .execute();

    // An in-flight poll on the retired instance resumes here.
    await manager.discoverDevices();

    assert.deepEqual(
      (await readAccount(ctx, account.id)).runtime_state,
      { device_id: 'install-uuid' },
      'a retired manager must not write its stale in-memory state back',
    );
  });
});
