/**
 * Must match `buffer` in `LitterboxStateTracker.processEvent` (API): the
 * samples at each edge of a period are the transition into and out of it, and
 * including them measures the cat arriving rather than what it then did.
 */
const PERIOD_STATS_BUFFER = 10;

export interface PeriodStats {
  mean: number;
  sigma: number;
}

/**
 * Mean and σ of one analyzer period, over the samples its edges do not reach.
 *
 * Recomputed here because the persisted segments do not carry it — the API
 * keeps `variance` on its own in-memory `StatePeriod`, but
 * `LitterboxAnalysisStatePeriodSchema` writes only state, bounds and the
 * elimination type. σ is the interesting half: on an eliminating period it is
 * what the device's analyzer thresholds to tell urination from defecation.
 *
 * Null when the period is too short to survive the trim, which is the honest
 * answer — two samples of a nine-sample period say nothing about it.
 */
export function trimmedSliceMeanSigma(
  weights: number[],
  startSample: number,
  endSample: number,
): PeriodStats | null {
  const lo = startSample + PERIOD_STATS_BUFFER;
  const hiExclusive = endSample + 1 - PERIOD_STATS_BUFFER;
  if (hiExclusive - lo < 2) return null;
  const slice = weights.slice(lo, hiExclusive);
  if (slice.length < 2) return null;
  const mean = slice.reduce((s, w) => s + w, 0) / slice.length;
  const v = slice.reduce((s, w) => s + (w - mean) ** 2, 0) / slice.length;
  return { mean, sigma: Math.sqrt(v) };
}

/** Grams, at the precision the number deserves rather than a fixed one. */
export function formatSigmaG(value: number): string {
  if (!Number.isFinite(value)) return '';
  return value >= 100 ? value.toFixed(0) : value.toFixed(1);
}

export function formatMeanG(value: number): string {
  if (!Number.isFinite(value)) return '';
  return Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(1);
}
