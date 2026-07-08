import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { analyzeWaterSegments } from '../analyzeWaterSegments.ts';

describe('analyzeWaterSegments', () => {
  it('labels a sustained in-band drop as drinking', () => {
    const weights: number[] = [];
    let level = 1000;
    for (let i = 0; i < 40; i++) {
      weights.push(level);
      if (i % 10 === 9) level -= 1;
    }

    const periods = analyzeWaterSegments(weights);
    const drinking = periods.filter((period) => period.state === 'drinking');

    assert.ok(drinking.length > 0);
    const longest = drinking.reduce((max, period) =>
      period.end - period.start > max.end - max.start ? period : max,
    );
    assert.ok(longest.end - longest.start >= 10);
  });

  it('returns no periods for a flat signal', () => {
    const weights = Array.from({ length: 20 }, () => 1000);
    const periods = analyzeWaterSegments(weights);
    assert.deepEqual(periods, [{ state: 'noise', start: 0, end: 20 }]);
  });
});
