// Mirrors the sliding-window analysis in FountainController so the frontend
// can colour each interval of the raw weight signal as drinking / spill / noise.

export type WaterSegmentState = 'drinking' | 'spill' | 'noise';

export interface WaterPeriod {
  state: WaterSegmentState;
  start: number; // inclusive sample index
  end: number;   // exclusive sample index
}

const DRINKING_RATE_MIN_ML_PER_MIN = 10;
const DRINKING_RATE_MAX_ML_PER_MIN = 90;
const SMOOTH_HALF = 2; // ±2 samples → 5-sample (~0.5 s) smoothing window
const RATE_HALF = 5;   // ±5 samples → ~1 s rate-estimation window
const HZ = 10;         // assumed sample rate

function smoothWeights(weights: number[]): number[] {
  return weights.map((_, i) => {
    const lo = Math.max(0, i - SMOOTH_HALF);
    const hi = Math.min(weights.length - 1, i + SMOOTH_HALF);
    let sum = 0;
    for (let j = lo; j <= hi; j++) sum += weights[j];
    return sum / (hi - lo + 1);
  });
}

function estimateRates(smoothed: number[]): number[] {
  return smoothed.map((_, i) => {
    const lo = Math.max(0, i - RATE_HALF);
    const hi = Math.min(smoothed.length - 1, i + RATE_HALF);
    const dtSamples = hi - lo;
    if (dtSamples === 0) return 0;
    const dtMin = dtSamples / HZ / 60;
    const drop = smoothed[lo] - smoothed[hi]; // positive = water consumed
    return drop / dtMin; // ml/min
  });
}

function classify(rate: number): WaterSegmentState {
  if (rate >= DRINKING_RATE_MIN_ML_PER_MIN && rate <= DRINKING_RATE_MAX_ML_PER_MIN) {
    return 'drinking';
  }
  if (rate > DRINKING_RATE_MAX_ML_PER_MIN) return 'spill';
  return 'noise';
}

export function analyzeWaterSegments(weights: number[]): WaterPeriod[] {
  if (weights.length < 2) return [];

  const smoothed = smoothWeights(weights);
  const rates = estimateRates(smoothed);

  const periods: WaterPeriod[] = [];
  let currentState = classify(rates[0]);
  let periodStart = 0;

  for (let i = 1; i < weights.length; i++) {
    const state = classify(rates[i]);
    if (state !== currentState) {
      periods.push({ state: currentState, start: periodStart, end: i });
      currentState = state;
      periodStart = i;
    }
  }
  periods.push({ state: currentState, start: periodStart, end: weights.length });

  return periods;
}
