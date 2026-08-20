/**
 * Pure metrics helpers for StateAnalyzer fixture harness (Wave 3).
 */

import type { LitterboxUseEliminationType } from 'shared';

export const ELIMINATION_CLASSES: LitterboxUseEliminationType[] = [
  'urination',
  'defecation',
  'both',
  'no_elimination',
  'unknown',
];

export interface TimeBout {
  tStartS: number;
  tEndS: number;
  boutType?: string;
}

export interface ConfusionAgg {
  matrix: Record<string, Record<string, number>>;
  perClassPrecision: Record<string, number>;
  perClassRecall: Record<string, number>;
  overallAccuracy: number;
  unknownAbstentionRate: number;
  n: number;
}

function ensureMatrixCell(
  m: Record<string, Record<string, number>>,
  row: string,
  col: string,
): void {
  if (!m[row]) m[row] = {};
  if (m[row][col] === undefined) m[row][col] = 0;
}

export function buildConfusionAndRates(
  pairs: Array<{
    actual: LitterboxUseEliminationType;
    predicted: LitterboxUseEliminationType;
  }>,
): ConfusionAgg {
  const matrix: Record<string, Record<string, number>> = {};
  for (const a of ELIMINATION_CLASSES) {
    matrix[a] = {};
    for (const b of ELIMINATION_CLASSES) matrix[a][b] = 0;
  }

  let unknownPred = 0;
  for (const { actual, predicted } of pairs) {
    ensureMatrixCell(matrix, actual, predicted);
    matrix[actual][predicted] = (matrix[actual][predicted] ?? 0) + 1;
    if (predicted === 'unknown') unknownPred++;
  }

  const n = pairs.length;
  const unknownAbstentionRate = n ? unknownPred / n : 0;

  let correct = 0;
  for (const { actual, predicted } of pairs) {
    if (actual === predicted) correct++;
  }
  const overallAccuracy = n ? correct / n : 0;

  const perClassPrecision: Record<string, number> = {};
  const perClassRecall: Record<string, number> = {};

  for (const c of ELIMINATION_CLASSES) {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    for (const { actual, predicted } of pairs) {
      if (predicted === c && actual === c) tp++;
      else if (predicted === c && actual !== c) fp++;
      else if (predicted !== c && actual === c) fn++;
    }
    perClassPrecision[c] = tp + fp ? tp / (tp + fp) : 0;
    perClassRecall[c] = tp + fn ? tp / (tp + fn) : 0;
  }

  return {
    matrix,
    perClassPrecision,
    perClassRecall,
    overallAccuracy,
    unknownAbstentionRate,
    n,
  };
}

/** Inflate [s,e] by halfPadS on each side (total width +2*halfPadS). */
export function inflateInterval(
  s: number,
  e: number,
  halfPadS: number,
): { s: number; e: number } {
  return {
    s: Math.max(0, s - halfPadS),
    e: e + halfPadS,
  };
}

function intervalOverlapLen(
  a: { s: number; e: number },
  b: { s: number; e: number },
): number {
  const lo = Math.max(a.s, b.s);
  const hi = Math.min(a.e, b.e);
  return Math.max(0, hi - lo);
}

/**
 * Greedy one-to-one matching: for each ground-truth bout (sorted by start),
 * pick the unmatched predicted bout with maximum overlap on inflated intervals.
 */
export function greedyBoutPairing(
  ground: TimeBout[],
  predicted: TimeBout[],
  inflateHalfPadS = 0.5,
): { tp: number; fp: number; fn: number } {
  const gInf = ground.map((b) => {
    const z = inflateInterval(b.tStartS, b.tEndS, inflateHalfPadS);
    return { ...z, raw: b };
  });
  const pInf = predicted.map((b) => {
    const z = inflateInterval(b.tStartS, b.tEndS, inflateHalfPadS);
    return { ...z, raw: b };
  });

  const usedP = new Set<number>();
  let tp = 0;

  const gSorted = gInf.map((g, i) => ({ g, i })).sort((a, b) => a.g.s - b.g.s);

  for (const { g } of gSorted) {
    let bestJ = -1;
    let bestOv = 0;
    for (let j = 0; j < pInf.length; j++) {
      if (usedP.has(j)) continue;
      const ov = intervalOverlapLen(g, pInf[j]);
      if (ov > bestOv) {
        bestOv = ov;
        bestJ = j;
      }
    }
    if (bestJ >= 0 && bestOv > 0) {
      usedP.add(bestJ);
      tp++;
    }
  }

  const fp = pInf.length - tp;
  const fn = gInf.length - tp;
  return { tp, fp, fn };
}

export function prf1(
  tp: number,
  fp: number,
  fn: number,
): {
  precision: number;
  recall: number;
  f1: number;
} {
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const f1 =
    precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : 0;
  return { precision, recall, f1 };
}

export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(p * sorted.length) - 1),
  );
  return sorted[idx];
}

export function median(sorted: number[]): number {
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

export function quantiles(values: number[]): {
  median: number;
  p90: number;
  p95: number;
} {
  if (!values.length) return { median: 0, p90: 0, p95: 0 };
  const s = [...values].sort((a, b) => a - b);
  return {
    median: median(s),
    p90: percentile(s, 0.9),
    p95: percentile(s, 0.95),
  };
}

export function relativeDelta(latest: number, baseline: number): number {
  if (!Number.isFinite(baseline) || baseline === 0) {
    if (baseline === 0 && latest === 0) return 0;
    if (baseline === 0 && latest !== 0) return 1;
    return 0;
  }
  return (latest - baseline) / Math.abs(baseline);
}

/** True if metric regressed more than threshold (lower is worse for accuracy/F1). */
export function regressedBeyond(
  latest: number,
  baseline: number,
  thresholdRel: number,
): boolean {
  if (!Number.isFinite(latest) || !Number.isFinite(baseline)) return false;
  return relativeDelta(latest, baseline) < -thresholdRel;
}
