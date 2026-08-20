import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
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
