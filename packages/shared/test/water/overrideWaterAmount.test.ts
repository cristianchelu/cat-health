import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { overrideWaterAmount } from '../../src/water/index.ts';
import type { WaterIntakeEventDataDTO } from '../../src/index.ts';

const analyzed: WaterIntakeEventDataDTO = {
  type: 'water_intake',
  amount: 30,
  duration: 45,
  source: 'drinking',
  raw_amount: 45,
  excluded_amount: 15,
  filtered: true,
};

describe('overrideWaterAmount', () => {
  it('moves the excluded remainder with the corrected amount', () => {
    const next = overrideWaterAmount(analyzed, 20);
    assert.equal(next.amount, 20);
    assert.equal(next.excluded_amount, 25);
    assert.equal(next.filtered, true);
    // The rest of the reading travels untouched.
    assert.equal(next.raw_amount, 45);
    assert.equal(next.duration, 45);
    assert.equal(next.source, 'drinking');
  });

  it('turns filtering off when the person claims the whole draw', () => {
    const next = overrideWaterAmount(analyzed, 45);
    assert.equal(next.excluded_amount, 0);
    assert.equal(next.filtered, false);
  });

  it('clamps the exclusion at zero when the amount exceeds the raw total', () => {
    const next = overrideWaterAmount(analyzed, 60);
    assert.equal(next.amount, 60);
    assert.equal(next.excluded_amount, 0);
    assert.equal(next.filtered, false);
  });

  it('sets only the amount when there is no raw total to split', () => {
    const manual: WaterIntakeEventDataDTO = {
      type: 'water_intake',
      amount: 30,
    };
    const next = overrideWaterAmount(manual, 12);
    assert.deepEqual(next, { type: 'water_intake', amount: 12 });
  });
});
