import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  analyzeWaterSegments,
  analyzeWaterRates,
  analyzeDrinkingFromSamples,
  weightSamplesAtFixedHz,
  DRINKING_RATE_MAX_ML_PER_MIN,
} from '../../src/water/index.ts';

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

  it('returns a single noise period for a flat signal', () => {
    const weights = Array.from({ length: 20 }, () => 1000);
    const periods = analyzeWaterSegments(weights);
    assert.deepEqual(periods, [{ state: 'noise', start: 0, end: 20 }]);
  });
});

describe('analyzeWaterRates', () => {
  it('has no rates to report for fewer than two samples', () => {
    assert.deepEqual(analyzeWaterRates([1000]).rates, []);
  });

  it('reads zero while the bowl holds still, and one rate per sample', () => {
    const weights = Array.from({ length: 20 }, () => 1000);
    const { rates } = analyzeWaterRates(weights);

    assert.equal(rates.length, weights.length);
    assert.ok(rates.every((rate) => Math.abs(rate) < 1e-9));
  });

  it('reports the drop as a positive ml/min', () => {
    /* 1 ml per sample at 10 Hz is 600 ml/min, well over the ceiling — the
       point is the sign and the scale, not that it reads as drinking. */
    const weights = Array.from({ length: 40 }, (_, i) => 1000 - i);
    const { rates, windowSeconds, sampleRateHz } = analyzeWaterRates(weights);

    assert.equal(windowSeconds, 1);
    assert.equal(sampleRateHz, 10);
    assert.ok(rates[20] > DRINKING_RATE_MAX_ML_PER_MIN);
  });

  it('agrees with the segments it is classified into', () => {
    const weights: number[] = [];
    let level = 1000;
    for (let i = 0; i < 40; i++) {
      weights.push(level);
      if (i % 10 === 9) level -= 1;
    }

    const { rates } = analyzeWaterRates(weights);
    const drinking = analyzeWaterSegments(weights).filter(
      (period) => period.state === 'drinking',
    );

    assert.ok(drinking.length > 0);
    for (const period of drinking) {
      const mid = Math.floor((period.start + period.end) / 2);
      assert.ok(rates[mid] <= DRINKING_RATE_MAX_ML_PER_MIN);
    }
  });
});

describe('analyzeDrinkingFromSamples', () => {
  it('returns zero metrics for fewer than two samples', () => {
    assert.deepEqual(analyzeDrinkingFromSamples([]), {
      amount: 0,
      duration: 0,
      rawAmount: 0,
      excludedAmount: 0,
      filtered: false,
    });
  });
});

describe('water analysis parity at 10 Hz', () => {
  it('chart segments and ingestion analysis agree on sustained drinking', () => {
    const weights: number[] = [];
    let level = 1000;
    for (let i = 0; i < 40; i++) {
      weights.push(level);
      if (i % 10 === 9) level -= 1;
    }

    const periods = analyzeWaterSegments(weights);
    const drinking = periods.some((period) => period.state === 'drinking');

    const analysis = analyzeDrinkingFromSamples(
      weightSamplesAtFixedHz(weights),
    );

    assert.equal(drinking, true);
    assert.ok(analysis.amount > 0);
    assert.ok(analysis.duration > 0);
  });
});
