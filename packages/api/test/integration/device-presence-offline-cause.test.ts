import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { EventBus } from '../../src/services/devices/EventBus.ts';
import { DevicePresence } from '../../src/services/devices/DevicePresence.ts';
import type { RecordDeviceEventInput } from '../../src/services/events/recordDeviceEvent.ts';
import { insertDevice, insertProviderAccount } from '../helpers/fixtures.ts';
import {
  createTestDb,
  destroyTestDb,
  type TestDbContext,
} from '../helpers/testDb.ts';

/** The anti-flap delay `reportOffline` arms. */
const OFFLINE_EVENT_DELAY_MS = 60_000;

describe('DevicePresence offline cause', () => {
  let ctx: TestDbContext;
  let deviceId: number;

  before(async () => {
    ctx = await createTestDb();
    const account = await insertProviderAccount(ctx.db, {
      provider: 'surepet',
    });
    const device = await insertDevice(ctx.db, {
      provider_account_id: account.id,
      type: 'feeder',
      external_id: 'feeder-cause',
    });
    deviceId = device.id;
  });

  after(async () => {
    await destroyTestDb(ctx);
  });

  async function offlineEvents(
    report: (presence: DevicePresence) => void,
    tick: (ms: number) => void,
  ) {
    const recorded: RecordDeviceEventInput[] = [];
    const presence = new DevicePresence({
      db: ctx.db,
      eventBus: new EventBus(),
      recordDeviceEvent: async (input) => {
        recorded.push(input);
        return 1;
      },
    });
    // Connectivity events are suppressed until hydration completes.
    await presence.hydrateAll();
    presence.reportOnline(deviceId);
    report(presence);
    tick(OFFLINE_EVENT_DELAY_MS + 1);
    return recorded
      .map((input) => input.data)
      .filter(
        (data) =>
          data.type === 'device_connectivity' && data.state === 'offline',
      );
  }

  it('carries the account cause into the delayed event', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const events = await offlineEvents(
      (presence) => presence.reportOffline(deviceId, { cause: 'account' }),
      (ms) => t.mock.timers.tick(ms),
    );
    assert.deepEqual(events, [
      {
        type: 'device_connectivity',
        state: 'offline',
        previous_state: 'online',
        cause: 'account',
      },
    ]);
  });

  it('keeps the cause from the first report of the transition', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const events = await offlineEvents(
      (presence) => {
        presence.reportOffline(deviceId, { cause: 'account' });
        presence.reportOffline(deviceId);
      },
      (ms) => t.mock.timers.tick(ms),
    );
    assert.equal(events.length, 1);
    assert.equal(
      events[0].type === 'device_connectivity' && events[0].cause,
      'account',
    );
  });

  it('leaves the cause out for a device that dropped by itself', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const events = await offlineEvents(
      (presence) => presence.reportOffline(deviceId),
      (ms) => t.mock.timers.tick(ms),
    );
    assert.equal(events.length, 1);
    assert.equal('cause' in events[0], false);
  });
});
