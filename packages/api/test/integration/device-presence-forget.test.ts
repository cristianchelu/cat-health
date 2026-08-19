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

/** The anti-flap delay `reportOffline` arms, plus a margin. */
const OFFLINE_EVENT_DELAY_MS = 60_000;

describe('DevicePresence.forget', () => {
  let ctx: TestDbContext;
  let deviceId: number;

  before(async () => {
    ctx = await createTestDb();
    const account = await insertProviderAccount(ctx.db, {
      provider: 'esphome',
      name: 'Home LAN',
    });
    const device = await insertDevice(ctx.db, {
      provider_account_id: account.id,
      name: 'Hall litterbox',
      type: 'litterbox',
      external_id: 'lb-presence',
    });
    deviceId = device.id;
  });

  after(async () => {
    await destroyTestDb(ctx);
  });

  async function createPresence(recorded: RecordDeviceEventInput[]) {
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
    return presence;
  }

  const offlineEvents = (recorded: RecordDeviceEventInput[]) =>
    recorded.filter(
      (input) =>
        input.data.type === 'device_connectivity' &&
        input.data.state === 'offline',
    );

  it('records an offline event when a device really drops (control)', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const recorded: RecordDeviceEventInput[] = [];
    const presence = await createPresence(recorded);

    presence.reportOnline(deviceId);
    presence.reportOffline(deviceId);
    t.mock.timers.tick(OFFLINE_EVENT_DELAY_MS + 1);

    assert.equal(offlineEvents(recorded).length, 1);
  });

  // The sequence real hardware produces: `disconnect()` reports offline inline,
  // then the socket closes and its handler reports offline again, after
  // `forget()` has already cleared the first timer.
  it('stays quiet when the transport reports offline again after forget', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const recorded: RecordDeviceEventInput[] = [];
    const presence = await createPresence(recorded);

    presence.reportOnline(deviceId);
    presence.reportOffline(deviceId); // disconnect()
    presence.forget(deviceId); // reconcileDeviceController
    presence.reportOffline(deviceId); // socket 'disconnect' handler, later
    t.mock.timers.tick(OFFLINE_EVENT_DELAY_MS + 1);

    assert.deepEqual(offlineEvents(recorded), []);
  });

  // Same two reports in the other order, which is what `disconnect()` produces
  // when it closes the socket before reporting.
  it('cancels a timer orphaned by a second offline report', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const recorded: RecordDeviceEventInput[] = [];
    const presence = await createPresence(recorded);

    presence.reportOnline(deviceId);
    presence.reportOffline(deviceId); // socket 'disconnect' handler: arms
    presence.reportOffline(deviceId); // disconnect() inline: replaces the entry
    presence.forget(deviceId);
    t.mock.timers.tick(OFFLINE_EVENT_DELAY_MS + 1);

    assert.deepEqual(offlineEvents(recorded), []);
  });

  // A flapping device hits the same pair of reports without any disable
  // involved, and must not report an outage it recovered from.
  it('cancels an orphaned timer when the device comes back on its own', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const recorded: RecordDeviceEventInput[] = [];
    const presence = await createPresence(recorded);

    presence.reportOnline(deviceId);
    presence.reportOffline(deviceId);
    presence.reportOffline(deviceId);
    presence.reportOnline(deviceId); // recovered well inside the anti-flap window
    t.mock.timers.tick(OFFLINE_EVENT_DELAY_MS + 1);

    assert.deepEqual(offlineEvents(recorded), []);
  });

  it('arms a fresh timer for a drop that follows a recovery', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const recorded: RecordDeviceEventInput[] = [];
    const presence = await createPresence(recorded);

    presence.reportOnline(deviceId);
    presence.reportOffline(deviceId);
    presence.reportOnline(deviceId); // cancels the first
    presence.reportOffline(deviceId); // must arm again, not reuse
    t.mock.timers.tick(OFFLINE_EVENT_DELAY_MS + 1);

    assert.equal(offlineEvents(recorded).length, 1);
  });

  it('resumes reporting once the device is switched back on', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const recorded: RecordDeviceEventInput[] = [];
    const presence = await createPresence(recorded);

    presence.reportOnline(deviceId);
    presence.forget(deviceId);
    presence.resume(deviceId);

    // A genuine drop after re-enabling is real news again.
    presence.reportOffline(deviceId);
    t.mock.timers.tick(OFFLINE_EVENT_DELAY_MS + 1);

    assert.equal(offlineEvents(recorded).length, 1);
  });

  it('drops the pending offline event once the device is forgotten', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const recorded: RecordDeviceEventInput[] = [];
    const presence = await createPresence(recorded);

    presence.reportOnline(deviceId);

    // The shape of a deliberate disable: teardown reports offline and arms the
    // anti-flap timer.
    presence.reportOffline(deviceId);
    presence.forget(deviceId);
    t.mock.timers.tick(OFFLINE_EVENT_DELAY_MS + 1);

    assert.deepEqual(offlineEvents(recorded), []);
  });
});
