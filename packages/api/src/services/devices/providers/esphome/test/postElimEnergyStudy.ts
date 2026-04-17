/**
 * One-off analysis script: post-elimination "energy" study.
 *
 * For every predicted `eliminating` period across the exported annotated
 * fixtures, compute a family of pre/post-plateau window features on the raw
 * weight stream, then emit:
 *
 *   - `post_elim_energy_rows.csv` — one row per predicted eliminating period.
 *   - `post_elim_energy_summary.json` — per-feature distribution stats and
 *     ROC-AUC (`real` vs `ghost`) on the primary labeled cohort.
 *
 * See `.cursor/plans/post-elim_energy_study_aa41dc8f.plan.md` and
 * `summaries/elimination-both-false-positive-experiments.md` for design notes.
 *
 * Run (from repo root):
 *   cd packages/api
 *   node --experimental-strip-types \
 *     src/services/devices/providers/esphome/test/postElimEnergyStudy.ts
 */

import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  StateAnalyzer,
  URINATION_VARIANCE_THRESHOLD_G,
  determineEliminationType,
  type StatePeriod,
} from '../StateAnalyzer.ts';
import {
  loadBouts,
  loadStream,
  loadVisits,
  type BoutRow,
  type VisitRow,
} from './analyzerHarnessFixtures.ts';
import { inflateInterval } from './analyzerHarnessMetrics.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = __dirname;
const OUT_CSV = path.join(FIXTURE_DIR, 'post_elim_energy_rows.csv');
const OUT_JSON = path.join(FIXTURE_DIR, 'post_elim_energy_summary.json');

/** Matches the per-period edge buffer used inside StateAnalyzer.processEvent. */
const EDGE_BUFFER_SAMPLES = 10;
/** Clipping span for `preAdjacent` / `postAdjacent` (seconds). */
const ADJACENT_CLIP_S = 20;
/** Fixed-window span for `preFixed5s` / `postFixed5s` (seconds). */
const FIXED_WINDOW_S = 5;
/** Trim after each `gap -> entering` boundary in `postBetweenGapTrim` (seconds). */
const GAP_TRIM_S = 2;
/** Bout-pairing inflation used by the harness (seconds, each side). */
const BOUT_INFLATE_HALF_PAD_S = 0.5;

type WindowName =
  | 'preBetween'
  | 'postBetween'
  | 'postBetweenGapTrim'
  | 'preAdjacent'
  | 'postAdjacent'
  | 'preFixed5s'
  | 'postFixed5s'
  | 'preSessionOnBox'
  | 'postSessionOnBox';

const WINDOW_NAMES: readonly WindowName[] = [
  'preBetween',
  'postBetween',
  'postBetweenGapTrim',
  'preAdjacent',
  'postAdjacent',
  'preFixed5s',
  'postFixed5s',
  'preSessionOnBox',
  'postSessionOnBox',
] as const;

type MetricName =
  | 'medianPerSecRms'
  | 'meanAbsDiff'
  | 'fracSecAboveT_2'
  | 'fracSecAboveT_4'
  | 'fracSecAboveT_6'
  | 'durationS'
  | 'offBoxFracS';

const METRIC_NAMES: readonly MetricName[] = [
  'medianPerSecRms',
  'meanAbsDiff',
  'fracSecAboveT_2',
  'fracSecAboveT_4',
  'fracSecAboveT_6',
  'durationS',
  'offBoxFracS',
] as const;

type LabelKind =
  | 'real'
  | 'ghost'
  | 'real_candidate'
  | 'ghost_candidate'
  | 'unknown';

function rmsAroundMean(samples: number[]): number {
  if (samples.length < 2) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i];
  const mean = sum / samples.length;
  let sq = 0;
  for (let i = 0; i < samples.length; i++) {
    const d = samples[i] - mean;
    sq += d * d;
  }
  return Math.sqrt(sq / samples.length);
}

function medianOfSorted(sorted: number[]): number {
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(p * sorted.length) - 1),
  );
  return sorted[idx];
}

/**
 * Mann-Whitney U derived AUC on two unsorted score arrays (positives=real,
 * negatives=ghost). Ties contribute 0.5. Returns NaN if either side is empty.
 */
function rocAuc(realScores: number[], ghostScores: number[]): number {
  if (!realScores.length || !ghostScores.length) return Number.NaN;
  let wins = 0;
  let ties = 0;
  for (const r of realScores) {
    for (const g of ghostScores) {
      if (r > g) wins++;
      else if (r === g) ties++;
    }
  }
  return (wins + 0.5 * ties) / (realScores.length * ghostScores.length);
}

/** Dense per-sample state, `undefined` for indices outside any period. */
function buildStateArray(
  periods: StatePeriod[],
  streamLen: number,
): Array<string | undefined> {
  const arr = new Array<string | undefined>(streamLen).fill(undefined);
  for (const p of periods) {
    const hi = Math.min(streamLen, p.end);
    for (let i = Math.max(0, p.start); i < hi; i++) arr[i] = p.state;
  }
  return arr;
}

const ON_BOX_STATES = new Set(['occupied', 'entering']);

function isOnBox(state: string | undefined): boolean {
  return state !== undefined && ON_BOX_STATES.has(state);
}

interface BoundingRange {
  start: number; // inclusive
  end: number; // exclusive
}

interface WindowSpec {
  /** Samples that enter the energy calculation. Sorted ascending, unique. */
  indices: number[];
  /** Bounding range used for `offBoxFracS` (may be broader than `indices`). */
  range: BoundingRange;
}

/** Indices where `periods[i].state === 'eliminating'`, in order. */
function eliminatingPeriodIndices(periods: StatePeriod[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < periods.length; i++) {
    if (periods[i].state === 'eliminating') out.push(i);
  }
  return out;
}

function sessionSpan(
  periods: StatePeriod[],
  streamLen: number,
): BoundingRange {
  if (!periods.length) return { start: 0, end: streamLen };
  return { start: periods[0].start, end: periods[periods.length - 1].end };
}

/**
 * For the plateau at `periodIndex`, return the sample-range boundaries of the
 * "between-plateau" window on each side, already edge-buffered.
 *
 *   - On the side that abuts another eliminating period, the boundary is insET
 *     by EDGE_BUFFER to avoid the neighbor's exit/entry jolt.
 *   - On the side that abuts the session boundary, no inset.
 */
function betweenBoundaries(
  periods: StatePeriod[],
  periodIndex: number,
  sessionRange: BoundingRange,
): { prev: number; next: number } {
  let prev = sessionRange.start;
  for (let i = periodIndex - 1; i >= 0; i--) {
    if (periods[i].state === 'eliminating') {
      prev = periods[i].end + EDGE_BUFFER_SAMPLES;
      break;
    }
  }
  let next = sessionRange.end;
  for (let i = periodIndex + 1; i < periods.length; i++) {
    if (periods[i].state === 'eliminating') {
      next = periods[i].start - EDGE_BUFFER_SAMPLES;
      break;
    }
  }
  return { prev, next };
}

function onBoxIndicesInRange(
  stateByIdx: Array<string | undefined>,
  range: BoundingRange,
): number[] {
  const lo = Math.max(0, range.start);
  const hi = Math.min(stateByIdx.length, range.end);
  const out: number[] = [];
  for (let i = lo; i < hi; i++) {
    if (isOnBox(stateByIdx[i])) out.push(i);
  }
  return out;
}

/**
 * `postBetweenGapTrim`: strip samples that fall within `gapTrimSamples` after
 * any `gap -> entering` transition inside the range (intended to drop re-entry
 * thumps). Works on the same on-box set as `postBetween`.
 */
function trimAfterReentry(
  onBoxIdx: number[],
  stateByIdx: Array<string | undefined>,
  range: BoundingRange,
  gapTrimSamples: number,
): number[] {
  const dropUntil: number[] = [];
  const lo = Math.max(0, range.start);
  const hi = Math.min(stateByIdx.length, range.end);
  for (let i = lo + 1; i < hi; i++) {
    if (stateByIdx[i - 1] === 'gap' && stateByIdx[i] === 'entering') {
      dropUntil.push(i + gapTrimSamples);
    }
  }
  if (!dropUntil.length) return onBoxIdx;
  return onBoxIdx.filter((i) => !dropUntil.some((cut) => i >= cut - gapTrimSamples && i < cut));
}

/**
 * `preAdjacent`: the single period directly preceding P, clipped to the last
 * `ADJACENT_CLIP_S` seconds before P, restricted to the edge-buffered side,
 * only if that period is `occupied` or `entering`.
 */
function adjacentPre(
  periods: StatePeriod[],
  periodIndex: number,
  hz: number,
): WindowSpec {
  const P = periods[periodIndex];
  const empty: WindowSpec = {
    indices: [],
    range: { start: P.start, end: P.start },
  };
  if (periodIndex === 0) return empty;
  const prev = periods[periodIndex - 1];
  if (!ON_BOX_STATES.has(prev.state)) return empty;
  const clipStart = Math.max(prev.start, P.start - Math.round(ADJACENT_CLIP_S * hz));
  const end = Math.max(clipStart, P.start - EDGE_BUFFER_SAMPLES);
  const indices: number[] = [];
  for (let i = clipStart; i < end; i++) indices.push(i);
  return { indices, range: { start: clipStart, end } };
}

function adjacentPost(
  periods: StatePeriod[],
  periodIndex: number,
  streamLen: number,
  hz: number,
): WindowSpec {
  const P = periods[periodIndex];
  const empty: WindowSpec = {
    indices: [],
    range: { start: P.end, end: P.end },
  };
  if (periodIndex >= periods.length - 1) return empty;
  const next = periods[periodIndex + 1];
  if (!ON_BOX_STATES.has(next.state)) return empty;
  const start = Math.min(next.end, P.end + EDGE_BUFFER_SAMPLES);
  const clipEnd = Math.min(
    next.end,
    P.end + Math.round(ADJACENT_CLIP_S * hz),
    streamLen,
  );
  const end = Math.max(start, clipEnd);
  const indices: number[] = [];
  for (let i = start; i < end; i++) indices.push(i);
  return { indices, range: { start, end } };
}

/**
 * `preFixed5s` / `postFixed5s`: a fixed time-budget (FIXED_WINDOW_S seconds)
 * worth of on-box samples outward from the edge-buffered plateau boundary,
 * stopping at the preBetween/postBetween bound (so we never cross the nearest
 * foreign plateau jolt).
 */
function fixedPre(
  stateByIdx: Array<string | undefined>,
  prevBound: number,
  periodStart: number,
  hz: number,
): WindowSpec {
  const budget = Math.round(FIXED_WINDOW_S * hz);
  const rangeEnd = Math.max(prevBound, periodStart - EDGE_BUFFER_SAMPLES);
  const rangeStart = Math.max(prevBound, rangeEnd - budget);
  const all: number[] = [];
  for (let i = rangeEnd - 1; i >= rangeStart; i--) {
    if (isOnBox(stateByIdx[i])) {
      all.push(i);
      if (all.length >= budget) break;
    }
  }
  all.sort((a, b) => a - b);
  return { indices: all, range: { start: rangeStart, end: rangeEnd } };
}

function fixedPost(
  stateByIdx: Array<string | undefined>,
  periodEnd: number,
  nextBound: number,
  hz: number,
): WindowSpec {
  const budget = Math.round(FIXED_WINDOW_S * hz);
  const rangeStart = Math.min(nextBound, periodEnd + EDGE_BUFFER_SAMPLES);
  const rangeEnd = Math.min(nextBound, rangeStart + budget);
  const all: number[] = [];
  for (let i = rangeStart; i < rangeEnd; i++) {
    if (isOnBox(stateByIdx[i])) {
      all.push(i);
      if (all.length >= budget) break;
    }
  }
  return { indices: all, range: { start: rangeStart, end: rangeEnd } };
}

/**
 * Split `indices` (sorted ascending) into contiguous runs of stream-adjacent
 * samples. Each run is a chunk of `indices[k] - indices[k-1] === 1` values.
 */
function contiguousRuns(indices: number[]): number[][] {
  if (!indices.length) return [];
  const runs: number[][] = [];
  let cur: number[] = [indices[0]];
  for (let k = 1; k < indices.length; k++) {
    if (indices[k] === indices[k - 1] + 1) {
      cur.push(indices[k]);
    } else {
      runs.push(cur);
      cur = [indices[k]];
    }
  }
  runs.push(cur);
  return runs;
}

function windowEnergyMetrics(
  weights: number[],
  spec: WindowSpec,
  stateByIdx: Array<string | undefined>,
  hz: number,
): Record<MetricName, number> {
  const result: Record<MetricName, number> = {
    medianPerSecRms: Number.NaN,
    meanAbsDiff: Number.NaN,
    fracSecAboveT_2: Number.NaN,
    fracSecAboveT_4: Number.NaN,
    fracSecAboveT_6: Number.NaN,
    durationS: 0,
    offBoxFracS: Number.NaN,
  };

  const runs = contiguousRuns(spec.indices);
  const windowSize = Math.max(1, Math.round(hz));

  const subWindowRms: number[] = [];
  for (const run of runs) {
    if (run.length < windowSize) continue;
    const nChunks = Math.floor(run.length / windowSize);
    for (let c = 0; c < nChunks; c++) {
      const offset = c * windowSize;
      const chunk: number[] = [];
      for (let k = 0; k < windowSize; k++) chunk.push(weights[run[offset + k]]);
      subWindowRms.push(rmsAroundMean(chunk));
    }
  }

  if (subWindowRms.length > 0) {
    const sorted = [...subWindowRms].sort((a, b) => a - b);
    result.medianPerSecRms = medianOfSorted(sorted);
    result.fracSecAboveT_2 =
      subWindowRms.filter((r) => r > 2).length / subWindowRms.length;
    result.fracSecAboveT_4 =
      subWindowRms.filter((r) => r > 4).length / subWindowRms.length;
    result.fracSecAboveT_6 =
      subWindowRms.filter((r) => r > 6).length / subWindowRms.length;
  }

  let diffSum = 0;
  let diffN = 0;
  for (const run of runs) {
    for (let k = 1; k < run.length; k++) {
      diffSum += Math.abs(weights[run[k]] - weights[run[k - 1]]);
      diffN++;
    }
  }
  if (diffN > 0) result.meanAbsDiff = diffSum / diffN;

  result.durationS = spec.indices.length / hz;

  const rangeLen = Math.max(0, spec.range.end - spec.range.start);
  if (rangeLen > 0) {
    let gap = 0;
    const lo = Math.max(0, spec.range.start);
    const hi = Math.min(stateByIdx.length, spec.range.end);
    for (let i = lo; i < hi; i++) if (stateByIdx[i] === 'gap') gap++;
    result.offBoxFracS = gap / rangeLen;
  }

  return result;
}

function countReentries(
  stateByIdx: Array<string | undefined>,
  range: BoundingRange,
): number {
  let n = 0;
  const lo = Math.max(1, range.start);
  const hi = Math.min(stateByIdx.length, range.end);
  for (let i = lo; i < hi; i++) {
    if (stateByIdx[i - 1] === 'gap' && stateByIdx[i] === 'entering') n++;
  }
  return n;
}

interface PeriodFeatureRow {
  visit_id: string;
  gt_session_elim: string;
  pred_session_elim: string;
  period_index: number;
  n_eliminating_periods: number;
  elim_variance: number;
  gap_between_periods_s: number;
  session_tail_s: number;
  n_reentries_after: number;
  label: LabelKind;
  features: Record<WindowName, Record<MetricName, number>>;
}

/**
 * Match ground-truth bouts against predicted eliminating periods using the
 * same inflated-overlap greedy strategy as the harness, but return the set of
 * matched predicted-period indices instead of just PR/F1.
 */
function matchBoutsToPeriods(
  groundBouts: BoutRow[],
  periods: StatePeriod[],
  hz: number,
): Set<number> {
  const gInf = groundBouts.map((b) => ({
    ...inflateInterval(b.t_start_s, b.t_end_s, BOUT_INFLATE_HALF_PAD_S),
  }));
  const pInf = periods.map((p, originalIdx) => ({
    ...inflateInterval(p.start / hz, p.end / hz, BOUT_INFLATE_HALF_PAD_S),
    originalIdx,
    state: p.state,
  }));

  const matched = new Set<number>();
  const used = new Set<number>();

  const gSorted = gInf.map((g, i) => ({ g, i })).sort((a, b) => a.g.s - b.g.s);
  for (const { g } of gSorted) {
    let bestJ = -1;
    let bestOv = 0;
    for (let j = 0; j < pInf.length; j++) {
      if (pInf[j].state !== 'eliminating') continue;
      if (used.has(j)) continue;
      const lo = Math.max(g.s, pInf[j].s);
      const hi = Math.min(g.e, pInf[j].e);
      const ov = Math.max(0, hi - lo);
      if (ov > bestOv) {
        bestOv = ov;
        bestJ = j;
      }
    }
    if (bestJ >= 0 && bestOv > 0) {
      used.add(bestJ);
      matched.add(pInf[bestJ].originalIdx);
    }
  }
  return matched;
}

/**
 * Primary label when the visit has per-bout GT:
 *   matched period → `real`, unmatched → `ghost`.
 *
 * Descriptive label when GT is session-only with a single-type session elim
 * and exactly two plateaus: the plateau whose variance agrees with GT is
 * `real_candidate`; the other is `ghost_candidate`. Ambiguous shape → `unknown`.
 */
function labelForPeriod(
  visit: VisitRow,
  periods: StatePeriod[],
  periodIndex: number,
  bouts: BoutRow[] | undefined,
  matchedPredIdxs: Set<number> | null,
): LabelKind {
  if (visit.bout_annotation_level === 'per_bout' && matchedPredIdxs) {
    return matchedPredIdxs.has(periodIndex) ? 'real' : 'ghost';
  }
  if (visit.bout_annotation_level === 'per_bout' && bouts === undefined) {
    return 'ghost';
  }

  if (
    visit.session_elimination_type !== 'urination' &&
    visit.session_elimination_type !== 'defecation'
  ) {
    return 'unknown';
  }
  const elimIdx = eliminatingPeriodIndices(periods);
  if (elimIdx.length !== 2) return 'unknown';

  const [iA, iB] = elimIdx;
  const vA = periods[iA].variance ?? Number.NaN;
  const vB = periods[iB].variance ?? Number.NaN;
  if (!Number.isFinite(vA) || !Number.isFinite(vB)) return 'unknown';

  const aIsUrination = vA < URINATION_VARIANCE_THRESHOLD_G;
  const bIsUrination = vB < URINATION_VARIANCE_THRESHOLD_G;
  if (aIsUrination === bIsUrination) return 'unknown';

  const gtUrination = visit.session_elimination_type === 'urination';
  const realIdx = gtUrination
    ? aIsUrination
      ? iA
      : iB
    : aIsUrination
      ? iB
      : iA;
  if (periodIndex === realIdx) return 'real_candidate';
  return 'ghost_candidate';
}

function computeAllWindows(
  weights: number[],
  periods: StatePeriod[],
  stateByIdx: Array<string | undefined>,
  periodIndex: number,
  hz: number,
): Record<WindowName, Record<MetricName, number>> {
  const P = periods[periodIndex];
  const session = sessionSpan(periods, weights.length);
  const bounds = betweenBoundaries(periods, periodIndex, session);

  const preBetweenRange: BoundingRange = {
    start: bounds.prev,
    end: Math.max(bounds.prev, P.start - EDGE_BUFFER_SAMPLES),
  };
  const postBetweenRange: BoundingRange = {
    start: Math.min(bounds.next, P.end + EDGE_BUFFER_SAMPLES),
    end: bounds.next,
  };
  const preSessionRange: BoundingRange = {
    start: session.start,
    end: Math.max(session.start, P.start - EDGE_BUFFER_SAMPLES),
  };
  const postSessionRange: BoundingRange = {
    start: Math.min(session.end, P.end + EDGE_BUFFER_SAMPLES),
    end: session.end,
  };

  const preBetween: WindowSpec = {
    indices: onBoxIndicesInRange(stateByIdx, preBetweenRange),
    range: preBetweenRange,
  };
  const postBetween: WindowSpec = {
    indices: onBoxIndicesInRange(stateByIdx, postBetweenRange),
    range: postBetweenRange,
  };
  const postBetweenGapTrim: WindowSpec = {
    indices: trimAfterReentry(
      postBetween.indices,
      stateByIdx,
      postBetweenRange,
      Math.round(GAP_TRIM_S * hz),
    ),
    range: postBetweenRange,
  };
  const preSessionOnBox: WindowSpec = {
    indices: onBoxIndicesInRange(stateByIdx, preSessionRange),
    range: preSessionRange,
  };
  const postSessionOnBox: WindowSpec = {
    indices: onBoxIndicesInRange(stateByIdx, postSessionRange),
    range: postSessionRange,
  };
  const preAdjacent = adjacentPre(periods, periodIndex, hz);
  const postAdjacent = adjacentPost(periods, periodIndex, weights.length, hz);
  const preFixed5s = fixedPre(stateByIdx, bounds.prev, P.start, hz);
  const postFixed5s = fixedPost(stateByIdx, P.end, bounds.next, hz);

  const specs: Record<WindowName, WindowSpec> = {
    preBetween,
    postBetween,
    postBetweenGapTrim,
    preAdjacent,
    postAdjacent,
    preFixed5s,
    postFixed5s,
    preSessionOnBox,
    postSessionOnBox,
  };

  const out = {} as Record<WindowName, Record<MetricName, number>>;
  for (const name of WINDOW_NAMES) {
    out[name] = windowEnergyMetrics(weights, specs[name], stateByIdx, hz);
  }
  return out;
}

function csvEscape(cell: string): string {
  if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}

function fmtNum(x: number): string {
  if (Number.isNaN(x)) return 'NaN';
  if (!Number.isFinite(x)) return x > 0 ? 'Infinity' : '-Infinity';
  return String(x);
}

function buildCsv(rows: PeriodFeatureRow[]): string {
  const baseCols = [
    'visit_id',
    'gt_session_elim',
    'pred_session_elim',
    'period_index',
    'n_eliminating_periods',
    'elim_variance',
    'gap_between_periods_s',
    'session_tail_s',
    'n_reentries_after',
    'label',
  ];
  const featureCols: string[] = [];
  for (const w of WINDOW_NAMES) {
    for (const m of METRIC_NAMES) featureCols.push(`${w}_${m}`);
  }
  const headers = [...baseCols, ...featureCols];
  const lines: string[] = [headers.join(',')];
  for (const r of rows) {
    const cells: string[] = [
      r.visit_id,
      r.gt_session_elim,
      r.pred_session_elim,
      String(r.period_index),
      String(r.n_eliminating_periods),
      fmtNum(r.elim_variance),
      fmtNum(r.gap_between_periods_s),
      fmtNum(r.session_tail_s),
      String(r.n_reentries_after),
      r.label,
    ];
    for (const w of WINDOW_NAMES) {
      for (const m of METRIC_NAMES) cells.push(fmtNum(r.features[w][m]));
    }
    lines.push(cells.map(csvEscape).join(','));
  }
  return lines.join('\n') + '\n';
}

interface FeatureSummary {
  auc: number;
  n_real: number;
  n_ghost: number;
  median_real: number;
  p90_real: number;
  median_ghost: number;
  p90_ghost: number;
}

function summarize(
  rows: PeriodFeatureRow[],
  filter: (r: PeriodFeatureRow) => boolean,
): Record<string, FeatureSummary> {
  const out: Record<string, FeatureSummary> = {};
  for (const w of WINDOW_NAMES) {
    for (const m of METRIC_NAMES) {
      const key = `${w}_${m}`;
      const real: number[] = [];
      const ghost: number[] = [];
      for (const r of rows) {
        if (!filter(r)) continue;
        const v = r.features[w][m];
        if (!Number.isFinite(v)) continue;
        if (r.label === 'real') real.push(v);
        else if (r.label === 'ghost') ghost.push(v);
      }
      const sr = [...real].sort((a, b) => a - b);
      const sg = [...ghost].sort((a, b) => a - b);
      out[key] = {
        auc: rocAuc(real, ghost),
        n_real: real.length,
        n_ghost: ghost.length,
        median_real: medianOfSorted(sr),
        p90_real: percentile(sr, 0.9),
        median_ghost: medianOfSorted(sg),
        p90_ghost: percentile(sg, 0.9),
      };
    }
  }
  return out;
}

function topFeaturesByAuc(
  summary: Record<string, FeatureSummary>,
  topN: number,
): Array<{ feature: string; summary: FeatureSummary; strength: number }> {
  const ranked = Object.entries(summary)
    .filter(([, s]) => Number.isFinite(s.auc))
    .map(([feature, s]) => ({
      feature,
      summary: s,
      strength: Math.abs(s.auc - 0.5),
    }))
    .sort((a, b) => b.strength - a.strength);
  return ranked.slice(0, topN);
}

interface WhatIfResult {
  feature: string;
  /** Max safe cutoff = min over GT=both visits of min(f1, f2). */
  safe_cutoff: number;
  /** Count of GT=both visits with min(f1,f2) < safe_cutoff. Always 0 at safe cutoff. */
  gt_both_losses_at_safe_cutoff: number;
  /** false-`both` visits whose weaker plateau falls below safe cutoff (candidate flips). */
  false_both_flipped_at_safe_cutoff: number;
  /** total false-`both` visits in cohort (pred=both, GT != both). */
  false_both_total: number;
  /** Breakdown of flips by what the GT says the real single-type should be. */
  flip_breakdown: {
    gt_urination_flipped_to_urination: number;
    gt_defecation_flipped_to_defecation: number;
    gt_urination_flipped_to_defecation: number;
    gt_defecation_flipped_to_urination: number;
    gt_other_flipped: number;
  };
  /** Total GT=both visits with 2 plateaus in the cohort. */
  gt_both_visits: number;
}

/**
 * Per-feature "drop the weaker plateau when min(f1,f2) < cutoff" gate,
 * evaluated on every pred=`both` visit (2 plateaus by construction):
 *
 *   - Safe cutoff = the largest threshold that never drops a plateau in a
 *     GT=`both` visit; i.e. `min_{GT=both} min(f_plateau)`.
 *   - At that cutoff, count how many false-`both` visits would have their
 *     weaker plateau demoted, and whether the surviving plateau's variance
 *     agrees with GT (urination ↔ variance < URINATION_VARIANCE_THRESHOLD_G).
 */
function whatIfGate(
  rows: PeriodFeatureRow[],
  window: WindowName,
  metric: MetricName,
): WhatIfResult | null {
  interface VisitPair {
    visit_id: string;
    gt: string;
    f: [number, number];
    v: [number, number];
  }
  const byVisit = new Map<string, PeriodFeatureRow[]>();
  for (const r of rows) {
    if (r.pred_session_elim !== 'both') continue;
    const list = byVisit.get(r.visit_id) ?? [];
    list.push(r);
    byVisit.set(r.visit_id, list);
  }
  const pairs: VisitPair[] = [];
  for (const [visit_id, periods] of byVisit) {
    if (periods.length !== 2) continue;
    const sorted = [...periods].sort((a, b) => a.period_index - b.period_index);
    const f0 = sorted[0].features[window][metric];
    const f1 = sorted[1].features[window][metric];
    if (!Number.isFinite(f0) || !Number.isFinite(f1)) continue;
    pairs.push({
      visit_id,
      gt: sorted[0].gt_session_elim,
      f: [f0, f1],
      v: [sorted[0].elim_variance, sorted[1].elim_variance],
    });
  }
  if (!pairs.length) return null;

  const gtBothMins = pairs
    .filter((p) => p.gt === 'both')
    .map((p) => Math.min(p.f[0], p.f[1]));
  if (!gtBothMins.length) return null;
  const safeCutoff = Math.min(...gtBothMins);

  let falseBothTotal = 0;
  let falseBothFlipped = 0;
  const fb = {
    gt_urination_flipped_to_urination: 0,
    gt_defecation_flipped_to_defecation: 0,
    gt_urination_flipped_to_defecation: 0,
    gt_defecation_flipped_to_urination: 0,
    gt_other_flipped: 0,
  };
  for (const p of pairs) {
    if (p.gt === 'both') continue;
    falseBothTotal++;
    const mn = Math.min(p.f[0], p.f[1]);
    if (mn >= safeCutoff) continue;
    falseBothFlipped++;
    const survivorIdx = p.f[0] > p.f[1] ? 0 : 1;
    const survivorVar = p.v[survivorIdx];
    const flippedType =
      survivorVar < URINATION_VARIANCE_THRESHOLD_G ? 'urination' : 'defecation';
    if (p.gt === 'urination' && flippedType === 'urination') {
      fb.gt_urination_flipped_to_urination++;
    } else if (p.gt === 'defecation' && flippedType === 'defecation') {
      fb.gt_defecation_flipped_to_defecation++;
    } else if (p.gt === 'urination' && flippedType === 'defecation') {
      fb.gt_urination_flipped_to_defecation++;
    } else if (p.gt === 'defecation' && flippedType === 'urination') {
      fb.gt_defecation_flipped_to_urination++;
    } else {
      fb.gt_other_flipped++;
    }
  }

  return {
    feature: `${window}_${metric}`,
    safe_cutoff: safeCutoff,
    gt_both_losses_at_safe_cutoff: 0,
    false_both_flipped_at_safe_cutoff: falseBothFlipped,
    false_both_total: falseBothTotal,
    flip_breakdown: fb,
    gt_both_visits: gtBothMins.length,
  };
}

async function main(): Promise<void> {
  if (!existsSync(path.join(FIXTURE_DIR, 'visits.csv'))) {
    console.error(
      `No fixtures at ${FIXTURE_DIR}. Export first per summaries/analyzer-benchmark-annotated-fixtures.md`,
    );
    process.exitCode = 1;
    return;
  }

  const visits = await loadVisits(FIXTURE_DIR);
  const boutRows = await loadBouts(FIXTURE_DIR);
  const boutsByVisit = new Map<string, BoutRow[]>();
  for (const b of boutRows) {
    const list = boutsByVisit.get(b.visit_id) ?? [];
    list.push(b);
    boutsByVisit.set(b.visit_id, list);
  }

  const rows: PeriodFeatureRow[] = [];
  let visitsWithPredElim = 0;
  const labelCounts: Record<LabelKind, number> = {
    real: 0,
    ghost: 0,
    real_candidate: 0,
    ghost_candidate: 0,
    unknown: 0,
  };

  for (const v of visits) {
    const weights = await loadStream(FIXTURE_DIR, v.stream_relpath);
    const r = new StateAnalyzer(v.knownGrams).processEvent(weights);
    const predElim = determineEliminationType(r.periods);
    const elimIdx = eliminatingPeriodIndices(r.periods);
    if (elimIdx.length === 0) continue;
    visitsWithPredElim++;

    const hz = v.sample_rate_hz > 0 ? v.sample_rate_hz : 10;
    const stateByIdx = buildStateArray(r.periods, weights.length);

    let matched: Set<number> | null = null;
    if (v.bout_annotation_level === 'per_bout') {
      const bouts = boutsByVisit.get(v.visit_id) ?? [];
      matched = matchBoutsToPeriods(bouts, r.periods, hz);
    }

    const gapBetween =
      elimIdx.length === 2
        ? (r.periods[elimIdx[1]].start - r.periods[elimIdx[0]].end) / hz
        : Number.NaN;

    for (const periodIndex of elimIdx) {
      const P = r.periods[periodIndex];
      const feats = computeAllWindows(
        weights,
        r.periods,
        stateByIdx,
        periodIndex,
        hz,
      );
      const label = labelForPeriod(
        v,
        r.periods,
        periodIndex,
        boutsByVisit.get(v.visit_id),
        matched,
      );
      labelCounts[label]++;
      const bounds = betweenBoundaries(
        r.periods,
        periodIndex,
        sessionSpan(r.periods, weights.length),
      );
      const row: PeriodFeatureRow = {
        visit_id: v.visit_id,
        gt_session_elim: v.session_elimination_type,
        pred_session_elim: predElim,
        period_index: periodIndex,
        n_eliminating_periods: elimIdx.length,
        elim_variance: P.variance ?? Number.NaN,
        gap_between_periods_s: gapBetween,
        session_tail_s: (weights.length - P.end) / hz,
        n_reentries_after: countReentries(stateByIdx, {
          start: P.end,
          end: bounds.next,
        }),
        label,
        features: feats,
      };
      rows.push(row);
    }
  }

  const csv = buildCsv(rows);
  await writeFile(OUT_CSV, csv, 'utf8');

  const primaryFilter = (r: PeriodFeatureRow): boolean =>
    r.pred_session_elim === 'both' || r.gt_session_elim === 'both';
  const onePlateauFilter = (r: PeriodFeatureRow): boolean =>
    r.n_eliminating_periods === 1;
  const twoPlateauFilter = (r: PeriodFeatureRow): boolean =>
    r.n_eliminating_periods === 2;

  const perFeaturePrimary = summarize(rows, primaryFilter);
  const perFeatureAll = summarize(rows, () => true);
  const perFeatureTwoPlateau = summarize(rows, twoPlateauFilter);
  const perFeatureOnePlateau = summarize(rows, onePlateauFilter);

  const cohortCounts = {
    visits_total: visits.length,
    visits_with_pred_elim: visitsWithPredElim,
    rows: rows.length,
    rows_primary_cohort: rows.filter(primaryFilter).length,
    rows_one_plateau: rows.filter(onePlateauFilter).length,
    rows_two_plateau: rows.filter(twoPlateauFilter).length,
    rows_pred_both: rows.filter((r) => r.pred_session_elim === 'both').length,
    rows_gt_both: rows.filter((r) => r.gt_session_elim === 'both').length,
    visits_pred_both: new Set(
      rows.filter((r) => r.pred_session_elim === 'both').map((r) => r.visit_id),
    ).size,
    visits_gt_both: new Set(
      rows.filter((r) => r.gt_session_elim === 'both').map((r) => r.visit_id),
    ).size,
    label_counts: labelCounts,
  };

  const topPrimary = topFeaturesByAuc(perFeaturePrimary, 10);
  const topAll = topFeaturesByAuc(perFeatureAll, 10);
  const topTwoPlateau = topFeaturesByAuc(perFeatureTwoPlateau, 10);

  const whatIfResults: WhatIfResult[] = [];
  for (const t of topPrimary) {
    const parsed = t.feature.match(/^(.+?)_(medianPerSecRms|meanAbsDiff|fracSecAboveT_\d+|durationS|offBoxFracS)$/);
    if (!parsed) continue;
    const w = parsed[1] as WindowName;
    const m = parsed[2] as MetricName;
    const res = whatIfGate(rows, w, m);
    if (res) whatIfResults.push(res);
  }

  const summary = {
    inputs: {
      fixture_dir: FIXTURE_DIR,
      visits_csv_rows: visits.length,
      bouts_csv_rows: boutRows.length,
    },
    cohort_counts: cohortCounts,
    per_feature_primary: perFeaturePrimary,
    per_feature_all: perFeatureAll,
    per_feature_two_plateau: perFeatureTwoPlateau,
    per_feature_one_plateau: perFeatureOnePlateau,
    top_features: {
      primary: topPrimary,
      all: topAll,
      two_plateau: topTwoPlateau,
    },
    what_if_gate: whatIfResults,
  };
  await writeFile(OUT_JSON, JSON.stringify(summary, null, 2), 'utf8');

  console.log(`\npost-elim energy study`);
  console.log(`  visits=${visits.length} withPredElim=${visitsWithPredElim} rows=${rows.length}`);
  console.log(`  primary cohort rows=${cohortCounts.rows_primary_cohort}`);
  console.log(
    `  labels: real=${labelCounts.real} ghost=${labelCounts.ghost} real_candidate=${labelCounts.real_candidate} ghost_candidate=${labelCounts.ghost_candidate} unknown=${labelCounts.unknown}`,
  );
  console.log(
    `  wrote: ${path.relative(FIXTURE_DIR, OUT_CSV)}, ${path.relative(FIXTURE_DIR, OUT_JSON)}`,
  );

  console.log('\ntop features by |AUC-0.5| on primary cohort (real=pos, ghost=neg):');
  for (const t of topPrimary) {
    const s = t.summary;
    console.log(
      `  ${t.feature.padEnd(40)}  AUC=${s.auc.toFixed(3)}  nR=${s.n_real} nG=${s.n_ghost}  medR=${s.median_real.toFixed(3)} medG=${s.median_ghost.toFixed(3)}`,
    );
  }

  console.log('\nwhat-if gate (safe cutoff = min-over-GT-both of min(f1,f2); drop weaker plateau if min(f)<cutoff):');
  console.log('  feature                                    cutoff     flipped / total-false-both   breakdown');
  for (const r of whatIfResults) {
    const b = r.flip_breakdown;
    const bd = `u→u=${b.gt_urination_flipped_to_urination} d→d=${b.gt_defecation_flipped_to_defecation} u→d=${b.gt_urination_flipped_to_defecation} d→u=${b.gt_defecation_flipped_to_urination} other=${b.gt_other_flipped}`;
    console.log(
      `  ${r.feature.padEnd(40)}  ${r.safe_cutoff.toFixed(3).padStart(9)}  ${String(r.false_both_flipped_at_safe_cutoff).padStart(3)} / ${String(r.false_both_total).padStart(3)}   ${bd}`,
    );
  }
}

void main();
