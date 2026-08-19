import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  StateAnalyzer,
  determineEliminationType,
  type StatePeriod,
} from '../StateAnalyzer.ts';

/** Sorted known weights match `StateAnalyzer` constructor ordering. */
function detectedCatIndex(
  knownCatWeights: number[],
  catWeight: number,
  tolFrac = 0.01,
): number {
  if (!knownCatWeights.length || catWeight <= 0) return -1;
  const sorted = [...knownCatWeights].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) {
    const w = sorted[i];
    if (w > 0 && Math.abs(catWeight - w) / w <= tolFrac) return i;
  }
  return -1;
}

/**
 * ~Flat grams for `sampleCount` samples. Tiny variation keeps Ring variance
 * &gt; 0 so `stableNow` can become true (perfectly constant streams never
 * enter `eliminating` in the current implementation).
 */
function gramsPlateauAround(targetGrams: number, sampleCount: number): number[] {
  const burstLen = Math.min(40, Math.max(10, Math.floor(sampleCount / 20)));
  const tailA = Math.floor((sampleCount - burstLen) / 2);
  const tailB = sampleCount - burstLen - tailA;
  const mk = (n: number, phase: number) =>
    Array.from({ length: n }, (_, i) => {
      const x = i + phase;
      return targetGrams + 0.4 * Math.sin(x / 4);
    });
  const burst = Array.from({ length: burstLen }, (_, i) => {
    return targetGrams + 200 * Math.sin(i / 2);
  });
  return [...mk(tailA, 0), ...burst, ...mk(tailB, tailA + burstLen)];
}

const REENTRY_WIN = 150;
const MAX_SESSION = 6000;

describe('StateAnalyzer smoke', () => {
  it('empty input: no session, zero weights, no_elimination', () => {
    const r = new StateAnalyzer().processEvent([]);
    assert.equal(detectedCatIndex([], r.catWeight), -1);
    assert.equal(r.periods.length, 0);
    assert.equal(r.catWeight, 0);
    assert.equal(r.wasteWeight, 0);
    assert.equal(determineEliminationType(r.periods), 'no_elimination');
  });

  it('sub-threshold constant weight never opens a session', () => {
    const weights = Array(200).fill(500);
    const r = new StateAnalyzer().processEvent(weights);
    assert.equal(detectedCatIndex([], r.catWeight), -1);
    assert.equal(r.periods.length, 0);
    assert.equal(r.catWeight, 0);
    assert.equal(r.wasteWeight, 0);
    assert.equal(determineEliminationType(r.periods), 'no_elimination');
  });

  it('known cat plateau: eliminating period(s), cat slot 0, catWeight within 1%', () => {
    const known = [4200];
    const weights = gramsPlateauAround(4200, 800);
    const r = new StateAnalyzer(known).processEvent(weights);
    assert.ok(r.periods.some((p) => p.state === 'eliminating'));
    assert.equal(detectedCatIndex(known, r.catWeight), 0);
    assert.ok(Math.abs(r.catWeight - 4200) / 4200 <= 0.01);
  });

  it('two known cats: heavier plateau selects sorted index 1', () => {
    const known = [3500, 5000];
    const weights = gramsPlateauAround(5000, 800);
    const r = new StateAnalyzer(known).processEvent(weights);
    assert.ok(r.periods.some((p) => p.state === 'eliminating'));
    assert.equal(detectedCatIndex(known, r.catWeight), 1);
    assert.ok(Math.abs(r.catWeight - 5000) / 5000 <= 0.01);
  });

  it('gap >= REENTRY_WIN: sessions split; waste near 0 when first session ends in gap', () => {
    const known = [4200];
    const rep = (n: number, v: number) => Array.from({ length: n }, () => v);
    const full = [...rep(300, 4200), ...rep(160, 0), ...rep(300, 4200)];
    assert.ok(160 > REENTRY_WIN);

    const afterFirstExit = new StateAnalyzer(known).processEvent(full.slice(0, 456));
    assert.ok(Math.abs(afterFirstExit.wasteWeight) < 50);

    const r = new StateAnalyzer(known).processEvent(full);
    const occupiedSpans = r.periods.filter((p) => p.state === 'occupied');
    assert.ok(occupiedSpans.length >= 2);
    const gapSpans = r.periods.filter((p) => p.state === 'gap');
    assert.ok(
      gapSpans.some((g) => g.end - g.start > REENTRY_WIN),
      'expected a long gap span exceeding REENTRY_WIN samples',
    );
    assert.ok(
      r.wasteWeight > 1000,
      'after re-entry past the long gap, wasteWeight reflects the pan load',
    );
  });

  it('gap < REENTRY_WIN: single visit spans both weight blocks', () => {
    const known = [4200];
    const rep = (n: number, v: number) => Array.from({ length: n }, () => v);
    const weights = [...rep(300, 4200), ...rep(100, 0), ...rep(300, 4200)];
    assert.ok(100 < REENTRY_WIN);
    const r = new StateAnalyzer(known).processEvent(weights);
    assert.equal(
      r.wasteWeight,
      0,
      'short gap: session should not finalize via re-entry timeout',
    );
    const gapSpans = r.periods.filter((p) => p.state === 'gap');
    assert.ok(
      gapSpans.every((g) => g.end - g.start <= REENTRY_WIN),
      'no gap span should exceed REENTRY_WIN for the short-gap fixture',
    );
  });

  it('MAX_SESSION: period end indices do not exceed sessionStart + maxSession', () => {
    const known = [4200];
    const weights = gramsPlateauAround(4200, 7000);
    const r = new StateAnalyzer(known).processEvent(weights);
    for (const p of r.periods) {
      assert.ok(p.end <= MAX_SESSION, `period end ${p.end} > ${MAX_SESSION}`);
    }
  });

  it('explicit hz=10 is bit-identical to the default constructor', () => {
    const known = [4200];
    const weights = gramsPlateauAround(4200, 900);
    const byDefault = new StateAnalyzer(known).processEvent(weights);
    const explicit = new StateAnalyzer(known, 10).processEvent(weights);
    assert.deepEqual(explicit, byDefault);
  });
});

describe('determineEliminationType', () => {
  const e = (variance: number): StatePeriod => ({
    state: 'eliminating',
    start: 0,
    end: 1,
    variance,
  });

  it('single eliminating variance < 4g → urination', () => {
    assert.equal(determineEliminationType([e(3)]), 'urination');
  });

  it('single eliminating variance ≥ 4g → defecation', () => {
    assert.equal(determineEliminationType([e(4)]), 'defecation');
    assert.equal(determineEliminationType([e(5)]), 'defecation');
  });

  it('two eliminating periods: one below, one above threshold → both', () => {
    assert.equal(determineEliminationType([e(2), e(6)]), 'both');
  });

  it('three+ eliminating periods → unknown', () => {
    assert.equal(determineEliminationType([e(2), e(3), e(4)]), 'unknown');
  });

  it('zero eliminating (or undefined variance) → no_elimination', () => {
    assert.equal(determineEliminationType([]), 'no_elimination');
    assert.equal(
      determineEliminationType([
        { state: 'occupied', start: 0, end: 10, variance: 1 },
      ]),
      'no_elimination',
    );
    assert.equal(
      determineEliminationType([
        { state: 'eliminating', start: 0, end: 10 },
      ]),
      'no_elimination',
    );
  });
});
