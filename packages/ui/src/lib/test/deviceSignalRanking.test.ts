import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEVICE_SIGNAL_KEYS, type DeviceSignal } from 'shared';
import {
  deviceSlotSignature,
  projectDeviceSlots,
  rankDeviceSignals,
} from '../deviceSignalRanking.ts';

function signal(
  key: string,
  overrides: Partial<DeviceSignal> = {},
): DeviceSignal {
  return {
    key,
    label_key: `devices.signals.${key}`,
    value: { kind: 'none' },
    display: { kind: 'none' },
    icon: 'check',
    category: 'primary',
    ...overrides,
  };
}

const percent = (
  key: string,
  value: number,
  overrides: Partial<DeviceSignal> = {},
) =>
  signal(key, {
    value: { kind: 'percent', value },
    display: { kind: 'bar', fill: value / 100 },
    severity: { kind: 'percent', value },
    ...overrides,
  });

const days = (key: string, value: number) =>
  signal(key, {
    value: { kind: 'days', value },
    severity: { kind: 'days', value },
  });

describe('rankDeviceSignals', () => {
  it('gives the gauge to the worst signal and the meta lines to the next two', () => {
    const slots = rankDeviceSignals([
      percent(DEVICE_SIGNAL_KEYS.WATER_LEVEL, 18),
      days(DEVICE_SIGNAL_KEYS.FILTER_LIFE, 0),
      signal(DEVICE_SIGNAL_KEYS.PUMP_FLOW, {
        severity: { kind: 'flag', value: 0 },
      }),
    ]);

    assert.equal(slots.gauge?.signal.key, DEVICE_SIGNAL_KEYS.FILTER_LIFE);
    assert.deepEqual(
      slots.meta.map((entry) => entry.signal.key),
      [DEVICE_SIGNAL_KEYS.WATER_LEVEL, DEVICE_SIGNAL_KEYS.PUMP_FLOW],
    );
    assert.equal(slots.attention, 'now');
  });

  it('never repeats the gauge signal in the meta lines', () => {
    const slots = rankDeviceSignals([
      percent(DEVICE_SIGNAL_KEYS.WATER_LEVEL, 5),
      days(DEVICE_SIGNAL_KEYS.FILTER_LIFE, 20),
    ]);

    assert.equal(slots.gauge?.signal.key, DEVICE_SIGNAL_KEYS.WATER_LEVEL);
    assert.ok(
      slots.meta.every((entry) => entry.signal.key !== slots.gauge?.signal.key),
    );
  });

  it('backfills meta lines from calm maintenance counters', () => {
    const slots = rankDeviceSignals([
      percent(DEVICE_SIGNAL_KEYS.WATER_LEVEL, 90),
      days(DEVICE_SIGNAL_KEYS.FILTER_LIFE, 21),
      signal(DEVICE_SIGNAL_KEYS.LAST_REFRESHED, {
        value: { kind: 'timestamp', value: new Date().toISOString() },
      }),
    ]);

    assert.equal(slots.attention, null);
    assert.equal(slots.meta.length, 2);
  });

  it('ranks a deep soon below a shallow now', () => {
    /* Urgency alone would invert these: water freshness enters `now` at 75
     * while a nearly-empty-band `soon` can ramp to 79. */
    const slots = rankDeviceSignals([
      days(DEVICE_SIGNAL_KEYS.WATER_FRESHNESS, 0),
      percent(DEVICE_SIGNAL_KEYS.WATER_LEVEL, 11),
    ]);

    assert.equal(slots.gauge?.tone, 'now');
    assert.equal(slots.gauge?.signal.key, DEVICE_SIGNAL_KEYS.WATER_FRESHNESS);
  });

  it('orders two signals in the same band by how deep they sit', () => {
    const shallow = rankDeviceSignals([
      percent(DEVICE_SIGNAL_KEYS.WATER_LEVEL, 9),
    ]);
    const deep = rankDeviceSignals([
      percent(DEVICE_SIGNAL_KEYS.WATER_LEVEL, 1),
    ]);

    assert.ok((deep.gauge?.urgency ?? 0) > (shallow.gauge?.urgency ?? 0));
  });

  it('pins offline to the first meta line and marks the readings stale', () => {
    const slots = rankDeviceSignals([
      signal(DEVICE_SIGNAL_KEYS.OFFLINE, {
        icon: 'alert',
        severity: { kind: 'hours', value: 72 },
      }),
      signal(DEVICE_SIGNAL_KEYS.LAST_SEEN, {
        icon: 'clock',
        value: { kind: 'timestamp', value: new Date().toISOString() },
      }),
      percent(DEVICE_SIGNAL_KEYS.WATER_LEVEL, 60),
    ]);

    assert.equal(slots.stale, true);
    assert.equal(slots.gauge?.signal.key, DEVICE_SIGNAL_KEYS.WATER_LEVEL);
    assert.equal(slots.meta[0]?.signal.key, DEVICE_SIGNAL_KEYS.OFFLINE);
    assert.equal(slots.meta[1]?.signal.key, DEVICE_SIGNAL_KEYS.LAST_SEEN);
    assert.equal(slots.attention, 'now');
  });

  it('keeps drawer-only signals out of the slots', () => {
    const slots = rankDeviceSignals([
      percent(DEVICE_SIGNAL_KEYS.WATER_LEVEL, 80),
      signal(DEVICE_SIGNAL_KEYS.SIGNAL_STRENGTH, {
        category: 'drawer',
        icon: 'signal',
        display: { kind: 'segments', lit: 3, of: 4 },
      }),
    ]);

    assert.deepEqual(
      slots.drawer.map((entry) => entry.key),
      [DEVICE_SIGNAL_KEYS.SIGNAL_STRENGTH],
    );
    assert.ok(
      slots.meta.every(
        (entry) => entry.signal.key !== DEVICE_SIGNAL_KEYS.SIGNAL_STRENGTH,
      ),
    );
  });

  it('lets a low battery hold both the drawer cell and a meta line', () => {
    const slots = rankDeviceSignals([
      percent(DEVICE_SIGNAL_KEYS.WASTE_SINCE_SCOOP, 50, {
        severity: { kind: 'ratio', value: 0.5 },
      }),
      percent(DEVICE_SIGNAL_KEYS.BATTERY, 15, { category: 'drawer_ranked' }),
    ]);

    assert.deepEqual(
      slots.drawer.map((entry) => entry.key),
      [DEVICE_SIGNAL_KEYS.BATTERY],
    );
    assert.equal(slots.gauge?.signal.key, DEVICE_SIGNAL_KEYS.BATTERY);
    assert.equal(slots.attention, 'soon');
  });

  it('keeps a healthy battery out of the slots', () => {
    /* A calm battery is already drawn in the drawer, and letting it take the
     * gauge made a full feeder headline "Battery 65%". It stays out of a spare
     * meta line too: the exact figure belongs in the drawer glyph's tooltip,
     * not on a second line inches away from the glyph itself. */
    const slots = rankDeviceSignals([
      percent(DEVICE_SIGNAL_KEYS.FEEDER_FILL, 100),
      percent(DEVICE_SIGNAL_KEYS.BATTERY, 65, { category: 'drawer_ranked' }),
    ]);

    assert.equal(slots.gauge?.signal.key, DEVICE_SIGNAL_KEYS.FEEDER_FILL);
    assert.ok(
      slots.meta.every(
        (entry) => entry.signal.key !== DEVICE_SIGNAL_KEYS.BATTERY,
      ),
    );
    assert.deepEqual(
      slots.drawer.map((entry) => entry.key),
      [DEVICE_SIGNAL_KEYS.BATTERY],
    );
  });

  it('ranks any measurement above a bare timestamp', () => {
    /* Both land near the bottom of the scale, but a card headlined "Last
     * updated" has answered the wrong question about a feeder. */
    const slots = rankDeviceSignals([
      signal(DEVICE_SIGNAL_KEYS.LAST_REFRESHED, {
        icon: 'clock',
        value: { kind: 'timestamp', value: new Date().toISOString() },
      }),
      percent(DEVICE_SIGNAL_KEYS.FEEDER_FILL, 100),
    ]);

    assert.equal(slots.gauge?.signal.key, DEVICE_SIGNAL_KEYS.FEEDER_FILL);
    assert.equal(slots.meta[0]?.signal.key, DEVICE_SIGNAL_KEYS.LAST_REFRESHED);
  });

  it('leads a calm litterbox with the waste in it', () => {
    /* Nothing here warrants a warning: a third of a scoop's worth of waste,
     * half a box of litter, a deep clean three weeks out. The one line worth
     * reading is still the one saying the box has been used. */
    const slots = rankDeviceSignals([
      signal(DEVICE_SIGNAL_KEYS.LITTER_REMAINING, {
        icon: 'litter',
        value: { kind: 'number', value: 3.8, unit: 'kg' },
        display: { kind: 'bar', fill: 0.55 },
        severity: { kind: 'percent', value: 55 },
      }),
      days(DEVICE_SIGNAL_KEYS.DEEP_CLEAN, 22),
      signal(DEVICE_SIGNAL_KEYS.WASTE_SINCE_SCOOP, {
        icon: 'waste',
        value: { kind: 'number', value: 51, unit: 'g' },
        display: { kind: 'pips', of: 8, pips: ['urination'] },
        severity: { kind: 'ratio', value: 0.34 },
      }),
    ]);

    assert.equal(slots.gauge?.signal.key, DEVICE_SIGNAL_KEYS.WASTE_SINCE_SCOOP);
    assert.equal(slots.attention, null);
  });

  it('re-ranks when a scoop empties the deposit counter', () => {
    const beforeScoop = rankDeviceSignals([
      signal(DEVICE_SIGNAL_KEYS.WASTE_SINCE_SCOOP, {
        icon: 'waste',
        value: { kind: 'number', value: 180, unit: 'g' },
        display: { kind: 'pips', of: 8, pips: ['urination', 'defecation'] },
        severity: { kind: 'ratio', value: 0.9 },
      }),
      signal(DEVICE_SIGNAL_KEYS.LITTER_REMAINING, {
        icon: 'litter',
        value: { kind: 'number', value: 5.2, unit: 'kg' },
        display: { kind: 'bar', fill: 0.87 },
        severity: { kind: 'percent', value: 87 },
      }),
      days(DEVICE_SIGNAL_KEYS.DEEP_CLEAN, 2),
    ]);

    const afterScoop = rankDeviceSignals([
      signal(DEVICE_SIGNAL_KEYS.WASTE_SINCE_SCOOP, {
        icon: 'waste',
        value: { kind: 'number', value: 0, unit: 'g' },
        display: { kind: 'pips', of: 8, pips: [] },
        severity: { kind: 'ratio', value: 0 },
      }),
      signal(DEVICE_SIGNAL_KEYS.LITTER_REMAINING, {
        icon: 'litter',
        value: { kind: 'number', value: 5.1, unit: 'kg' },
        display: { kind: 'bar', fill: 0.85 },
        severity: { kind: 'percent', value: 85 },
      }),
      days(DEVICE_SIGNAL_KEYS.DEEP_CLEAN, 2),
    ]);

    assert.equal(
      beforeScoop.gauge?.signal.key,
      DEVICE_SIGNAL_KEYS.WASTE_SINCE_SCOOP,
    );
    assert.equal(
      afterScoop.gauge?.signal.key,
      DEVICE_SIGNAL_KEYS.DEEP_CLEAN,
      'an emptied box promotes its next-ranked counter to the gauge',
    );
    assert.equal(afterScoop.meta.length, 2);
  });

  it('tolerates a device with no signals at all', () => {
    const slots = rankDeviceSignals();
    assert.equal(slots.gauge, null);
    assert.deepEqual(slots.meta, []);
    assert.equal(slots.attention, null);
    assert.equal(slots.stale, false);
  });
});

describe('deviceSlotSignature', () => {
  it('ignores a reading that drifts without changing the ranking', () => {
    const before = deviceSlotSignature([
      percent(DEVICE_SIGNAL_KEYS.WATER_LEVEL, 80),
    ]);
    const after = deviceSlotSignature([
      percent(DEVICE_SIGNAL_KEYS.WATER_LEVEL, 79),
    ]);

    assert.equal(before, after);
  });

  it('changes when a signal crosses into another tone', () => {
    const calm = deviceSlotSignature([
      percent(DEVICE_SIGNAL_KEYS.WATER_LEVEL, 30),
    ]);
    const soon = deviceSlotSignature([
      percent(DEVICE_SIGNAL_KEYS.WATER_LEVEL, 20),
    ]);

    assert.notEqual(calm, soon);
  });

  it('keeps a held assignment showing the latest reading', () => {
    const held = rankDeviceSignals([
      percent(DEVICE_SIGNAL_KEYS.WATER_LEVEL, 80),
      days(DEVICE_SIGNAL_KEYS.FILTER_LIFE, 20),
    ]);
    const projected = projectDeviceSlots(held, [
      percent(DEVICE_SIGNAL_KEYS.WATER_LEVEL, 77),
      days(DEVICE_SIGNAL_KEYS.FILTER_LIFE, 20),
    ]);

    assert.equal(
      projected.gauge?.signal.key,
      held.gauge?.signal.key,
      'the slot must not move',
    );
    assert.deepEqual(projected.gauge?.signal.value, {
      kind: 'percent',
      value: 77,
    });
  });

  it('changes when a signal appears', () => {
    const one = deviceSlotSignature([
      percent(DEVICE_SIGNAL_KEYS.WATER_LEVEL, 80),
    ]);
    const two = deviceSlotSignature([
      percent(DEVICE_SIGNAL_KEYS.WATER_LEVEL, 80),
      days(DEVICE_SIGNAL_KEYS.FILTER_LIFE, 10),
    ]);

    assert.notEqual(one, two);
  });
});
