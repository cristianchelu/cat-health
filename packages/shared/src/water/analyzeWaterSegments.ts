import type { WaterPeriod, WaterSegmentState } from './types.ts';

const DRINKING_RATE_MIN_ML_PER_MIN = 10;
const DRINKING_RATE_MAX_ML_PER_MIN = 90;
const EMA_SPAN = 10;
const RATE_HALF = 5;
const HZ = 10;
const MIN_DRINKING_DURATION_SAMPLES = 10;

function emaSmooth(weights: number[]): number[] {
  const alpha = 2 / (EMA_SPAN + 1);
  const out = new Array<number>(weights.length);
  out[0] = weights[0];
  for (let i = 1; i < weights.length; i++) {
    out[i] = alpha * weights[i] + (1 - alpha) * out[i - 1];
  }
  return out;
}

function estimateRates(smoothed: number[]): number[] {
  return smoothed.map((_, i) => {
    const lo = Math.max(0, i - RATE_HALF);
    const hi = Math.min(smoothed.length - 1, i + RATE_HALF);
    const dtSamples = hi - lo;
    if (dtSamples === 0) return 0;
    const dtMin = dtSamples / HZ / 60;
    const drop = smoothed[lo] - smoothed[hi];
    return drop / dtMin;
  });
}

function classify(rate: number): WaterSegmentState {
  if (
    rate >= DRINKING_RATE_MIN_ML_PER_MIN &&
    rate <= DRINKING_RATE_MAX_ML_PER_MIN
  ) {
    return 'drinking';
  }
  if (rate > DRINKING_RATE_MAX_ML_PER_MIN) return 'spill';
  return 'noise';
}

/** Classify fountain weight samples for chart colouring (fixed 10 Hz assumption). */
export function analyzeWaterSegments(weights: number[]): WaterPeriod[] {
  if (weights.length < 2) return [];

  const smoothed = emaSmooth(weights);
  const rates = estimateRates(smoothed);

  const raw: WaterPeriod[] = [];
  let currentState = classify(rates[0]);
  let periodStart = 0;

  for (let i = 1; i < weights.length; i++) {
    const state = classify(rates[i]);
    if (state !== currentState) {
      raw.push({ state: currentState, start: periodStart, end: i });
      currentState = state;
      periodStart = i;
    }
  }
  raw.push({ state: currentState, start: periodStart, end: weights.length });

  const demoted = raw.map((period) =>
    period.state === 'drinking' &&
    period.end - period.start < MIN_DRINKING_DURATION_SAMPLES
      ? { ...period, state: 'noise' as WaterSegmentState }
      : period,
  );

  const merged: WaterPeriod[] = [];
  for (const period of demoted) {
    const prev = merged[merged.length - 1];
    if (prev && prev.state === period.state) {
      prev.end = period.end;
    } else {
      merged.push({ ...period });
    }
  }

  return merged;
}
