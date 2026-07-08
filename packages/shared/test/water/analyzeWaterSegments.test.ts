import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  analyzeWaterSegments,
  analyzeDrinkingFromSamples,
  weightSamplesAtFixedHz,
} from "../../src/water/index.ts";

describe("analyzeWaterSegments", () => {
  it("labels a sustained in-band drop as drinking", () => {
    const weights: number[] = [];
    let level = 1000;
    for (let i = 0; i < 40; i++) {
      weights.push(level);
      if (i % 10 === 9) level -= 1;
    }

    const periods = analyzeWaterSegments(weights);
    const drinking = periods.filter((period) => period.state === "drinking");

    assert.ok(drinking.length > 0);
    const longest = drinking.reduce((max, period) =>
      period.end - period.start > max.end - max.start ? period : max,
    );
    assert.ok(longest.end - longest.start >= 10);
  });

  it("returns a single noise period for a flat signal", () => {
    const weights = Array.from({ length: 20 }, () => 1000);
    const periods = analyzeWaterSegments(weights);
    assert.deepEqual(periods, [{ state: "noise", start: 0, end: 20 }]);
  });
});

describe("analyzeDrinkingFromSamples", () => {
  it("returns zero metrics for fewer than two samples", () => {
    assert.deepEqual(analyzeDrinkingFromSamples([]), {
      amount: 0,
      duration: 0,
      rawAmount: 0,
      excludedAmount: 0,
      filtered: false,
    });
  });
});

describe("water analysis parity at 10 Hz", () => {
  it("chart segments and ingestion analysis agree on sustained drinking", () => {
    const weights: number[] = [];
    let level = 1000;
    for (let i = 0; i < 40; i++) {
      weights.push(level);
      if (i % 10 === 9) level -= 1;
    }

    const periods = analyzeWaterSegments(weights);
    const drinking = periods.some((period) => period.state === "drinking");

    const analysis = analyzeDrinkingFromSamples(
      weightSamplesAtFixedHz(weights),
    );

    assert.equal(drinking, true);
    assert.ok(analysis.amount > 0);
    assert.ok(analysis.duration > 0);
  });
});
