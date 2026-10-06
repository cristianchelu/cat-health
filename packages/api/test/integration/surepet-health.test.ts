import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import { ProductId } from 'shared';

import { EventBus } from '../../src/services/devices/EventBus.ts';
import { DevicePresence } from '../../src/services/devices/DevicePresence.ts';
import { MediaManager } from '../../src/services/media/MediaManager.ts';
import { recordDeviceEvent } from '../../src/services/events/recordDeviceEvent.ts';
import { SurePetAccountManager } from '../../src/services/devices/providers/surepet/SurePetAccountManager.ts';
import {
  SUREPET_API_BASE,
  SUREPET_LOGIN_URL,
} from '../../src/services/devices/providers/surepet/constants.ts';
import { ProviderPermanentError } from '../../src/services/devices/providerFailure.ts';
import type { AccountDeps } from '../../src/services/devices/types.ts';
import { insertDevice, insertProviderAccount } from '../helpers/fixtures.ts';
import {
  createTestDb,
  destroyTestDb,
  type TestDbContext,
} from '../helpers/testDb.ts';

const TOKEN = `stored.${'x'.repeat(340)}`;

/** The state poll's tick, reached the way its interval reaches it. */
interface ManagerInternals {
  pollFeederStates(): Promise<void>;
}

type Cloud = 'down' | 'refuses-feeder' | 'refuses-login';

function mockSurePetCloud(cloud: Cloud) {
  mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = String(input);
    if (cloud === 'down') {
      throw new TypeError('fetch failed', {
        cause: new Error('getaddrinfo EAI_AGAIN'),
      });
    }
    if (url === SUREPET_LOGIN_URL) {
      return new Response('{}', { status: 401 });
    }
    if (url.startsWith(`${SUREPET_API_BASE}/pet?`)) {
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  });
}

describe('SurePet state poll as the account heartbeat', () => {
  const contexts: TestDbContext[] = [];

  afterEach(async () => {
    mock.restoreAll();
    while (contexts.length) {
      const ctx = contexts.pop();
      if (ctx) await destroyTestDb(ctx);
    }
  });

  const setup = async (cloud: Cloud) => {
    const ctx = await createTestDb();
    contexts.push(ctx);
    const account = await insertProviderAccount(ctx.db, {
      provider: 'surepet',
      config: { email: 'you@example.com', password: 'pw' },
      // No token for the login case, so the tick has to log in.
      runtime_state: {
        device_id: 'install',
        household_id: 42,
        ...(cloud === 'refuses-login' ? {} : { token: TOKEN }),
      },
    });
    const device = await insertDevice(ctx.db, {
      provider_account_id: account.id,
      external_id: '916520',
      type: 'feeder',
      config: { product_id: ProductId.FEEDER_CONNECT, household_id: 42 },
    });

    const failures: unknown[] = [];
    const eventBus = new EventBus();
    const deps: AccountDeps = {
      db: ctx.db,
      eventBus,
      mediaManager: new MediaManager(ctx.db),
      directory: {
        instantiateController: async () => undefined,
        getLinkedCamera: async () => undefined,
      },
      health: { fail: (error) => failures.push(error) },
      presence: new DevicePresence({
        db: ctx.db,
        eventBus,
        recordDeviceEvent: (input) =>
          recordDeviceEvent({ db: ctx.db, eventBus }, input),
      }),
      logger: { ...console, warn: () => {}, error: () => {} },
    };

    const manager = new SurePetAccountManager(account, deps);
    manager.instantiateDeviceController(device);
    mockSurePetCloud(cloud);
    const tick = () =>
      (manager as unknown as ManagerInternals).pollFeederStates();
    return { tick, failures };
  };

  it('reports the account after two unreachable ticks in a row', async () => {
    const { tick, failures } = await setup('down');

    await tick();
    assert.equal(failures.length, 0);

    await tick();
    assert.equal(failures.length, 1);
  });

  it('does not count a feeder that fails on its own', async () => {
    const { tick, failures } = await setup('refuses-feeder');

    await tick();
    await tick();
    assert.equal(failures.length, 0);
  });

  it('reports a refused login at once, as permanent', async () => {
    const { tick, failures } = await setup('refuses-login');

    await tick();
    assert.equal(failures.length, 1);
    assert.ok(failures[0] instanceof ProviderPermanentError);
  });
});
