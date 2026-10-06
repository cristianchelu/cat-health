import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ProviderAccount } from '../../../database/types/ProviderAccountTable.ts';
import { AccountEntry, type AccountEntryClock } from '../AccountEntry.ts';
import { ProviderPermanentError } from '../providerFailure.ts';
import type { AccountHealthReporter, AccountManager } from '../types.ts';

const ACCOUNT: ProviderAccount = {
  id: 7,
  provider: 'scripted',
  name: 'Home',
  config: {},
  runtime_state: {},
  enabled: 1,
  internal: 0,
  created_at: 0,
  updated_at: 0,
};

/** Timers that only fire when a test says so. */
function fakeClock() {
  let now = 1_000_000;
  const pending = new Map<number, () => void>();
  let nextId = 1;
  const clock: AccountEntryClock = {
    now: () => now,
    random: () => 0.5,
    setTimeout: (callback) => {
      const id = nextId++;
      pending.set(id, callback);
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeout: (timer) => {
      pending.delete(timer as unknown as number);
    },
  };
  return {
    clock,
    pending: () => pending.size,
    /** Fires every pending timer, as if its delay had passed. */
    elapse: (ms: number) => {
      now += ms;
      const callbacks = [...pending.values()];
      pending.clear();
      for (const callback of callbacks) callback();
    },
  };
}

interface Built {
  reporter: AccountHealthReporter;
  shutdowns: number;
}

/**
 * Each start takes the next outcome from `starts`; one that runs out
 * succeeds. `onDown` can be held open to widen the failure's teardown.
 */
function setup(starts: Array<'ok' | Error> = []) {
  const time = fakeClock();
  const built: Built[] = [];
  let downGate: Promise<void> = Promise.resolve();

  const entry = new AccountEntry({
    accountId: ACCOUNT.id,
    createManager: (_account, reporter) => {
      const record: Built = { reporter, shutdowns: 0 };
      built.push(record);
      const manager: AccountManager = {
        accountId: ACCOUNT.id,
        initialize: async () => {
          const step = starts.shift() ?? 'ok';
          if (step instanceof Error) throw step;
        },
        shutdown: async () => {
          record.shutdowns += 1;
        },
        discoverDevices: async () => [],
        instantiateDeviceController: () => {
          throw new Error('not used');
        },
      };
      return manager;
    },
    retryPolicy: () => ({ baseMs: 1_000, maxMs: 8_000 }),
    loadAccount: async () => ACCOUNT,
    onDown: () => downGate,
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    clock: time.clock,
  });

  return {
    entry,
    built,
    time,
    holdDown: () => {
      let release!: () => void;
      downGate = new Promise((resolve) => (release = resolve));
      return release;
    },
  };
}

/** Lets queued operations run to completion. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('AccountEntry', () => {
  it('backs off after a failed start and comes up on the retry', async () => {
    const { entry, built, time } = setup([new Error('fetch failed')]);

    await entry.start();
    const down = entry.getHealth();
    assert.equal(down?.state, 'unavailable');
    assert.equal(down?.attempts, 1);
    assert.equal(
      down?.next_retry_at,
      new Date(time.clock.now() + 1_000).toISOString(),
    );
    assert.equal(entry.manager, undefined);

    time.elapse(1_000);
    await settle();
    assert.equal(entry.getHealth()?.state, 'ok');
    assert.equal(entry.manager !== undefined, true);
    assert.equal(built.length, 2);
  });

  it('stops for good on a permanent error', async () => {
    const { entry, time } = setup([new ProviderPermanentError('refused')]);

    await entry.start();
    assert.equal(entry.getHealth()?.state, 'failed');
    assert.equal(time.pending(), 0);
  });

  it('ignores a failure from a manager it has replaced', async () => {
    const { entry, built } = setup();
    await entry.start();
    await entry.start();

    built[0].reporter.fail(new Error('late news'));
    await settle();

    assert.equal(entry.getHealth()?.state, 'ok');
    assert.equal(built[1].shutdowns, 0);
  });

  // A start arriving while a failure is still taking the devices down: the
  // failure must finish first, and its retry must not mount over the start.
  it('runs a start after a failure in flight, and voids its retry', async () => {
    const { entry, built, time, holdDown } = setup();
    await entry.start();

    const release = holdDown();
    built[0].reporter.fail(new Error('cloud gone'));
    const restart = entry.start();
    release();
    await restart;

    assert.equal(built.length, 2);
    assert.equal(built[0].shutdowns, 1);
    assert.equal(built[1].shutdowns, 0);
    assert.equal(time.pending(), 0);
    assert.equal(entry.getHealth()?.state, 'ok');
  });

  it('does not let a retry that already fired remount over a start', async () => {
    const { entry, built, time } = setup([new Error('down')]);
    await entry.start();

    const restart = entry.start();
    time.elapse(1_000);
    await restart;
    await settle();

    assert.equal(built.length, 2);
    assert.equal(built[1].shutdowns, 0);
  });

  it('forgets its health and pending retry when stopped', async () => {
    const { entry, time } = setup([new Error('down')]);
    await entry.start();

    await entry.stop();
    assert.equal(entry.getHealth(), null);
    assert.equal(time.pending(), 0);
  });
});
