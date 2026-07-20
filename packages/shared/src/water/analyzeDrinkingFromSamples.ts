import type { DrinkingAnalysis, WeightSample } from "./types.ts";

const DRINKING_RATE_MIN_ML_PER_MIN = 10;
const DRINKING_RATE_MAX_ML_PER_MIN = 90;
const EMA_SPAN = 10;
const RATE_HALF_WINDOW = 5;
const MIN_DRINKING_DURATION_SAMPLES = 10;

/** Aggregate valid drinking amount/duration from timestamped weight samples. */
export function analyzeDrinkingFromSamples(
  samples: WeightSample[],
): DrinkingAnalysis {
  if (samples.length < 2) {
    return {
      amount: 0,
      duration: 0,
      rawAmount: 0,
      excludedAmount: 0,
      filtered: false,
    };
  }

  const n = samples.length;
  const alpha = 2 / (EMA_SPAN + 1);
  const smoothed = new Array<number>(n);
  smoothed[0] = samples[0].weight;
  for (let i = 1; i < n; i++) {
    smoothed[i] = alpha * samples[i].weight + (1 - alpha) * smoothed[i - 1];
  }

  const rates = samples.map((_, i) => {
    const lo = Math.max(0, i - RATE_HALF_WINDOW);
    const hi = Math.min(n - 1, i + RATE_HALF_WINDOW);
    const dtMs = samples[hi].timestampMs - samples[lo].timestampMs;
    if (dtMs <= 0) return 0;
    return ((smoothed[lo] - smoothed[hi]) / dtMs) * 60_000;
  });

  type IntervalClass = "drinking" | "other";
  const intervalClass = new Array<IntervalClass>(n - 1);
  for (let i = 0; i < n - 1; i++) {
    const intervalRate = (rates[i] + rates[i + 1]) / 2;
    intervalClass[i] =
      intervalRate >= DRINKING_RATE_MIN_ML_PER_MIN &&
      intervalRate <= DRINKING_RATE_MAX_ML_PER_MIN
        ? "drinking"
        : "other";
  }

  const validIntervals = new Uint8Array(n - 1);
  let runStart = -1;
  for (let i = 0; i <= n - 1; i++) {
    const inBand = i < n - 1 && intervalClass[i] === "drinking";
    if (inBand && runStart === -1) {
      runStart = i;
    } else if (!inBand && runStart !== -1) {
      const runLen = i - runStart;
      if (runLen >= MIN_DRINKING_DURATION_SAMPLES) {
        for (let j = runStart; j < i; j++) validIntervals[j] = 1;
      }
      runStart = -1;
    }
  }

  let validAmount = 0;
  let validDurationMs = 0;
  let hasExclusions = false;

  for (let i = 0; i < n - 1; i++) {
    const dtMs = samples[i + 1].timestampMs - samples[i].timestampMs;
    if (dtMs <= 0) continue;

    const drop = smoothed[i] - smoothed[i + 1];
    if (drop <= 0) continue;

    if (validIntervals[i]) {
      validAmount += drop;
      validDurationMs += dtMs;
    } else {
      hasExclusions = true;
    }
  }

  const rawAmount = Math.max(0, smoothed[0] - smoothed[n - 1]);

  return {
    amount: Math.round(Math.max(0, validAmount)),
    duration: Math.round(validDurationMs / 1000),
    rawAmount: Math.round(rawAmount),
    excludedAmount: Math.round(Math.max(0, rawAmount - validAmount)),
    filtered: hasExclusions,
  };
}

export function weightSamplesAtFixedHz(
  weights: number[],
  hz = 10,
  startMs = 0,
): WeightSample[] {
  const stepMs = 1000 / hz;
  return weights.map((weight, index) => ({
    timestampMs: startMs + index * stepMs,
    weight,
  }));
}
