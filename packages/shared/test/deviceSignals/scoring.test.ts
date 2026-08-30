import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BACKFILL_URGENCY,
  DEVICE_SIGNAL_KEYS,
  scoreDeviceSignal,
} from '../../src/deviceSignals/scoring.ts';

describe('water_freshness scoring (fraction of interval remaining)', () => {
  const freshness = (value: number) =>
    scoreDeviceSignal({
      key: DEVICE_SIGNAL_KEYS.WATER_FRESHNESS,
      severity: { kind: 'ratio', value },
    });

  it('is calm through most of the cycle', () => {
    assert.equal(freshness(1).tone, 'calm');
    assert.equal(freshness(0.5).tone, 'calm');
  });

  it('turns soon in the last fifth of the cycle', () => {
    assert.equal(freshness(0.2).tone, 'soon');
    assert.equal(freshness(0.05).tone, 'soon');
  });

  it('turns now at due and past it', () => {
    assert.equal(freshness(0).tone, 'now');
    assert.equal(freshness(-0.5).tone, 'now');
  });

  it('scores the same fraction identically whatever the cycle length', () => {
    // 6 hours into a 12-hour bowl cycle and 2.5 days into a 5-day fountain
    // cycle are both value 0.5: one curve, no per-device thresholds.
    assert.deepEqual(freshness(6 / 12), freshness(2.5 / 5));
  });
});

describe('storage scoring', () => {
  const storage = (value: number) =>
    scoreDeviceSignal({
      key: DEVICE_SIGNAL_KEYS.STORAGE,
      severity: { kind: 'percent', value },
    });

  it('is calm below the soon threshold', () => {
    assert.equal(storage(50).tone, 'calm');
  });

  it('turns soon at 85 percent full', () => {
    assert.equal(storage(85).tone, 'soon');
  });

  it('turns now at 95 percent full', () => {
    assert.equal(storage(95).tone, 'now');
  });
});

describe('waste_since_scoop scoring (ratio against the scoop threshold)', () => {
  const waste = (value: number) =>
    scoreDeviceSignal({
      key: DEVICE_SIGNAL_KEYS.WASTE_SINCE_SCOOP,
      severity: { kind: 'ratio', value },
    });

  it('drops to the bottom of the scale on a scooped box', () => {
    assert.equal(waste(0).tone, 'calm');
    assert.equal(waste(0).urgency, BACKFILL_URGENCY);
  });

  it('leads the calm counters as soon as anything is in the box', () => {
    /* One deposit is a thing its owner deals with today; half a box of litter
     * and a deep clean weeks out are not. */
    const single = waste(0.05);
    assert.equal(single.tone, 'calm');
    assert.ok(
      single.urgency >
        scoreDeviceSignal({
          key: DEVICE_SIGNAL_KEYS.LITTER_REMAINING,
          severity: { kind: 'percent', value: 55 },
        }).urgency,
    );
    assert.ok(
      single.urgency >
        scoreDeviceSignal({
          key: DEVICE_SIGNAL_KEYS.DEEP_CLEAN,
          severity: { kind: 'days', value: 22 },
        }).urgency,
    );
  });

  it('still orders two dirty boxes by how dirty they are', () => {
    assert.ok(waste(0.7).urgency > waste(0.1).urgency);
  });

  it('warns only at the threshold the owner set', () => {
    assert.equal(waste(0.74).tone, 'calm');
    assert.equal(waste(0.75).tone, 'soon');
    assert.equal(waste(1).tone, 'now');
  });
});
