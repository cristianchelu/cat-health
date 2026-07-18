import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { calorieBoundsFromWeight } from '../dailyMetricTrends.ts';

const DEFAULT_DAILY_TARGET_KCAL = 220;

describe('calorieBoundsFromWeight', () => {
  it('uses weight-scaled targets when average weight is known', () => {
    const bounds = calorieBoundsFromWeight(4000);
    const weightKg = 4;
    const target = 70 * weightKg ** 0.75;

    assert.ok(Math.abs(bounds.lowerBound - target * 0.8) < 0.01);
    assert.ok(Math.abs(bounds.upperBound - target * 1.2) < 0.01);
  });

  it('falls back to the default daily target when weight is unknown', () => {
    const bounds = calorieBoundsFromWeight(0);

    assert.equal(bounds.lowerBound, DEFAULT_DAILY_TARGET_KCAL * 0.8);
    assert.equal(bounds.upperBound, DEFAULT_DAILY_TARGET_KCAL * 1.2);
  });
});
