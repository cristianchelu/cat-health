// Mirrors the EMA + time-in-band analysis in FountainController so the frontend
// can colour each interval of the raw weight signal as drinking / spill / noise.

export type WaterSegmentState = 'drinking' | 'spill' | 'noise';

export interface WaterPeriod {
  state: WaterSegmentState;
  start: number; // inclusive sample index
  end: number;   // exclusive sample index
}

const DRINKING_RATE_MIN_ML_PER_MIN = 10;
const DRINKING_RATE_MAX_ML_PER_MIN = 90;
const EMA_SPAN = 10;          // ~1s at 10 Hz; alpha = 2/(span+1)
const RATE_HALF = 5;          // ±5 samples → ~1 s rate-estimation window
const HZ = 10;                // assumed sample rate
const MIN_DRINKING_DURATION_SAMPLES = 10; // min contiguous in-band samples (~1s) to count as drinking

function emaSmooth(weights: number[]): number[] {
  const alpha = 2 / (EMA_SPAN + 1);
  const out: number[] = new Array(weights.length);
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

  const smoothed = emaSmooth(weights);
  const rates = estimateRates(smoothed);

  // Build initial periods from per-sample classification
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

  // Time-in-band: demote short drinking runs to noise, then merge adjacent same-state
  const demoted = raw.map((p) =>
    p.state === 'drinking' && p.end - p.start < MIN_DRINKING_DURATION_SAMPLES
      ? { ...p, state: 'noise' as WaterSegmentState }
      : p,
  );

  const merged: WaterPeriod[] = [];
  for (const p of demoted) {
    const prev = merged[merged.length - 1];
    if (prev && prev.state === p.state) {
      prev.end = p.end;
    } else {
      merged.push({ ...p });
    }
  }

  return merged;
}
