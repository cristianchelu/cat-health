/**
 * StateAnalyzer fixture harness (Wave 3).
 *
 * Loads fixture exports (gitignored): visits.csv, streams/*.txt, bouts.csv.
 * Produce them with exportHumanVerifiedLitterboxFixtures.ts (--selection verified |
 * annotated | any); see that script for column definitions.
 *
 * Baseline workflow (guard against silent regressions):
 * 1. Run with fixtures: `npm run test:analyzer -w packages/api` → writes test/metrics_latest.json
 * 2. When satisfied: `cp src/services/devices/providers/esphome/test/metrics_latest.json \
 *      src/services/devices/providers/esphome/test/metrics_baseline.json` and commit the baseline.
 * 3. Future runs compare latest vs baseline; the test fails if elimination accuracy, cat accuracy,
 *    or bout F1 drops more than 5% relative to baseline (when those metrics exist in baseline).
 */

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import type { LitterboxUseEliminationType } from 'shared';

import {
  StateAnalyzer,
  determineEliminationType,
  type StatePeriod,
} from '../StateAnalyzer.ts';
import {
  ELIMINATION_CLASSES,
  buildConfusionAndRates,
  greedyBoutPairing,
  prf1,
  quantiles,
  regressedBeyond,
  relativeDelta,
  type TimeBout,
} from './analyzerHarnessMetrics.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FIXTURE_DIR = __dirname;
const METRICS_LATEST = path.join(FIXTURE_DIR, 'metrics_latest.json');
const METRICS_BASELINE = path.join(FIXTURE_DIR, 'metrics_baseline.json');

function fixturesAvailable(): boolean {
  return existsSync(path.join(FIXTURE_DIR, 'visits.csv'));
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuote) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuote = true;
    } else if (c === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function parseEliminationType(s: string): LitterboxUseEliminationType {
  if ((ELIMINATION_CLASSES as readonly string[]).includes(s)) {
    return s as LitterboxUseEliminationType;
  }
  throw new Error(`Invalid session_elimination_type: ${s}`);
}

export interface VisitRow {
  visit_id: string;
  household_id: string;
  contributor_anon_id: string;
  stream_relpath: string;
  sample_rate_hz: number;
  session_elimination_type: LitterboxUseEliminationType;
  ground_truth_cat_slot: number;
  knownGrams: number[];
  straining: boolean;
  bout_annotation_level: string;
}

export interface BoutRow {
  visit_id: string;
  bout_index: number;
  t_start_s: number;
  t_end_s: number;
  bout_type: string;
}

export async function loadVisits(dir: string): Promise<VisitRow[]> {
  const text = await readFile(path.join(dir, 'visits.csv'), 'utf8');
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]);
  const idx = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`visits.csv missing column: ${name}`);
    return i;
  };
  const rows: VisitRow[] = [];
  for (let li = 1; li < lines.length; li++) {
    const cells = parseCsvLine(lines[li]);
    const knownKg: number[] = JSON.parse(cells[idx('known_kg_json')]);
    const knownGrams = knownKg.map((kg) => kg * 1000);
    rows.push({
      visit_id: cells[idx('visit_id')],
      household_id: cells[idx('household_id')],
      contributor_anon_id: cells[idx('contributor_anon_id')] ?? '',
      stream_relpath: cells[idx('stream_relpath')],
      sample_rate_hz: Number(cells[idx('sample_rate_hz')]),
      session_elimination_type: parseEliminationType(
        cells[idx('session_elimination_type')],
      ),
      ground_truth_cat_slot: Number.parseInt(
        cells[idx('ground_truth_cat_slot')],
        10,
      ),
      knownGrams,
      straining: cells[idx('straining')] === 'true',
      bout_annotation_level: cells[idx('bout_annotation_level')] ?? '',
    });
  }
  return rows;
}

/** One tenth-gram integer per line → grams (float). */
export async function loadStream(dir: string, relpath: string): Promise<number[]> {
  const text = await readFile(path.join(dir, relpath), 'utf8');
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => Number.parseInt(l, 10) / 10);
}

export async function loadBouts(dir: string): Promise<BoutRow[]> {
  const p = path.join(dir, 'bouts.csv');
  if (!existsSync(p)) return [];
  const text = await readFile(p, 'utf8');
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]);
  const idx = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`bouts.csv missing column: ${name}`);
    return i;
  };
  const out: BoutRow[] = [];
  for (let li = 1; li < lines.length; li++) {
    const cells = parseCsvLine(lines[li]);
    out.push({
      visit_id: cells[idx('visit_id')],
      bout_index: Number.parseInt(cells[idx('bout_index')], 10),
      t_start_s: Number(cells[idx('t_start_s')]),
      t_end_s: Number(cells[idx('t_end_s')]),
      bout_type: cells[idx('bout_type')],
    });
  }
  return out;
}

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

function predictedBoutsFromPeriods(
  periods: StatePeriod[],
  sampleRateHz: number,
): TimeBout[] {
  const hz = sampleRateHz > 0 ? sampleRateHz : 10;
  const out: TimeBout[] = [];
  for (const p of periods) {
    if (p.state !== 'eliminating') continue;
    out.push({
      tStartS: p.start / hz,
      tEndS: p.end / hz,
    });
  }
  return out;
}

interface StratBucket {
  n: number;
  elim_correct: number;
  cat_correct: number;
  cat_n: number;
}

function emptyBucket(): StratBucket {
  return { n: 0, elim_correct: 0, cat_correct: 0, cat_n: 0 };
}

interface MetricsSnapshot {
  visit_count: number;
  elimination: ReturnType<typeof buildConfusionAndRates> & {
    by_session_elimination_type: Record<
      string,
      { accuracy: number; n: number }
    >;
    by_straining: Record<
      'true' | 'false',
      { accuracy: number; n: number }
    >;
  };
  cat: {
    accuracy_excluding_unknown_slot: number;
    evaluated: number;
    by_session_elimination_type: Record<
      string,
      { accuracy: number; n: number }
    >;
    by_straining: Record<'true' | 'false', { accuracy: number; n: number }>;
  };
  bouts: {
    has_data: boolean;
    tp: number;
    fp: number;
    fn: number;
    precision: number;
    recall: number;
    f1: number;
  };
  continuous: {
    waste_abs_error: { median: number; p90: number; p95: number };
    cat_abs_error_grams: { median: number; p90: number; p95: number };
    cat_within_5pct_rate: number;
    cat_within_n: number;
  };
  stratified_continuous: {
    by_session_elimination_type: Record<
      string,
      {
        n: number;
        waste_abs_error: { median: number; p90: number; p95: number };
        cat_abs_error_grams: { median: number; p90: number; p95: number };
        cat_within_5pct_rate: number;
        cat_within_n: number;
      }
    >;
    by_straining: Record<
      'true' | 'false',
      {
        n: number;
        waste_abs_error: { median: number; p90: number; p95: number };
        cat_abs_error_grams: { median: number; p90: number; p95: number };
        cat_within_5pct_rate: number;
        cat_within_n: number;
      }
    >;
  };
}

function pad(s: string, w: number): string {
  return s.length >= w ? s.slice(0, w) : s + ' '.repeat(w - s.length);
}

function printSummary(m: MetricsSnapshot): void {
  const rows: string[][] = [];
  const w = 14;
  rows.push(['METRIC', 'VALUE']);
  rows.push(['visits', String(m.visit_count)]);
  rows.push(['elim accuracy', m.elimination.overallAccuracy.toFixed(4)]);
  rows.push(['unknown abstain', m.elimination.unknownAbstentionRate.toFixed(4)]);
  rows.push([
    'cat accuracy*',
    m.cat.accuracy_excluding_unknown_slot.toFixed(4),
  ]);
  rows.push(['cat eval n', String(m.cat.evaluated)]);
  if (m.bouts.has_data) {
    rows.push(['bout P/R/F1', `${m.bouts.precision.toFixed(3)}/${m.bouts.recall.toFixed(3)}/${m.bouts.f1.toFixed(3)}`]);
  } else {
    rows.push(['bout P/R/F1', '(no bout rows)']);
  }
  rows.push([
    'waste |err|',
    `med ${m.continuous.waste_abs_error.median.toFixed(1)} / p90 ${m.continuous.waste_abs_error.p90.toFixed(1)}`,
  ]);
  rows.push([
    'cat |err| g',
    `med ${m.continuous.cat_abs_error_grams.median.toFixed(1)} / p90 ${m.continuous.cat_abs_error_grams.p90.toFixed(1)}`,
  ]);
  rows.push([
    'cat ≤5%',
    `${(m.continuous.cat_within_5pct_rate * 100).toFixed(1)}% (n=${m.continuous.cat_within_n})`,
  ]);

  const col0 = Math.max(...rows.map((r) => r[0].length), 8);
  const col1 = Math.max(...rows.map((r) => r[1].length), w);
  console.log('\n--- StateAnalyzer harness metrics ---');
  for (const [a, b] of rows) {
    console.log(`${pad(a, col0)}  ${pad(b, col1)}`);
  }
  console.log('*Cat accuracy excludes ground_truth_cat_slot === -1');

  const conf = m.elimination.matrix;
  console.log('\nConfusion (rows=GT, cols=pred):');
  const labels = [...ELIMINATION_CLASSES];
  const cw = 12;
  console.log(
    `${pad('', cw)}` +
      labels.map((c) => pad(c.slice(0, 10), cw)).join(''),
  );
  for (const row of labels) {
    let line = pad(row.slice(0, 10), cw);
    for (const col of labels) {
      line += pad(String(conf[row]?.[col] ?? 0), cw);
    }
    console.log(line);
  }
  console.log('');
}

const harnessEnabled = fixturesAvailable();

(harnessEnabled ? describe : describe.skip)(
  'StateAnalyzer fixture harness (Wave 3)',
  () => {
    it('replay visits, metrics, metrics_latest.json, optional baseline gate', async () => {
      const visits = await loadVisits(FIXTURE_DIR);
      const boutRows = await loadBouts(FIXTURE_DIR);
      const boutsByVisit = new Map<string, TimeBout[]>();
      for (const b of boutRows) {
        const list = boutsByVisit.get(b.visit_id) ?? [];
        list.push({
          tStartS: b.t_start_s,
          tEndS: b.t_end_s,
          boutType: b.bout_type,
        });
        boutsByVisit.set(b.visit_id, list);
      }
      const hasBoutData = boutRows.length > 0;

      const elimPairs: Array<{
        actual: LitterboxUseEliminationType;
        predicted: LitterboxUseEliminationType;
      }> = [];

      let catEval = 0;
      let catCorrect = 0;

      const wasteErrs: number[] = [];
      const catErrs: number[] = [];
      let catWithin5 = 0;
      let catWithin5N = 0;

      const bySession: Record<string, StratBucket> = {};
      const byStrain: Record<'true' | 'false', StratBucket> = {
        true: emptyBucket(),
        false: emptyBucket(),
      };

      let boutTp = 0;
      let boutFp = 0;
      let boutFn = 0;

      type ContAcc = {
        waste: number[];
        catErr: number[];
        catWithinHit: number;
        catWithinN: number;
      };
      const mkCont = (): ContAcc => ({
        waste: [],
        catErr: [],
        catWithinHit: 0,
        catWithinN: 0,
      });
      const contSession: Record<string, ContAcc> = {};
      const contStrain: Record<'true' | 'false', ContAcc> = {
        true: mkCont(),
        false: mkCont(),
      };

      for (const v of visits) {
        const weights = await loadStream(FIXTURE_DIR, v.stream_relpath);
        const analyzer = new StateAnalyzer(v.knownGrams);
        const r = analyzer.processEvent(weights);
        const predictedElim = determineEliminationType(r.periods);
        elimPairs.push({
          actual: v.session_elimination_type,
          predicted: predictedElim,
        });

        const sk = v.session_elimination_type;
        if (!bySession[sk]) bySession[sk] = emptyBucket();
        bySession[sk].n++;
        if (predictedElim === v.session_elimination_type) {
          bySession[sk].elim_correct++;
        }

        const strainKey = v.straining ? 'true' : 'false';
        byStrain[strainKey].n++;
        if (predictedElim === v.session_elimination_type) {
          byStrain[strainKey].elim_correct++;
        }

        if (v.ground_truth_cat_slot >= 0) {
          catEval++;
          const det = detectedCatIndex(v.knownGrams, r.catWeight);
          if (det === v.ground_truth_cat_slot) {
            catCorrect++;
            bySession[sk].cat_correct++;
            bySession[sk].cat_n++;
            byStrain[strainKey].cat_correct++;
            byStrain[strainKey].cat_n++;
          } else {
            bySession[sk].cat_n++;
            byStrain[strainKey].cat_n++;
          }

          const known = v.knownGrams[v.ground_truth_cat_slot];
          if (known > 0) {
            const ce = Math.abs(r.catWeight - known);
            catErrs.push(ce);
            catWithin5N++;
            const within = ce / known <= 0.05;
            if (within) catWithin5++;

            if (!contSession[sk]) contSession[sk] = mkCont();
            contSession[sk].catErr.push(ce);
            contSession[sk].catWithinN++;
            if (within) contSession[sk].catWithinHit++;

            contStrain[strainKey].catErr.push(ce);
            contStrain[strainKey].catWithinN++;
            if (within) contStrain[strainKey].catWithinHit++;
          }
        }

        const finalG = weights.length ? weights[weights.length - 1] : 0;
        const wErr = Math.abs(r.wasteWeight - finalG);
        wasteErrs.push(wErr);

        if (!contSession[sk]) contSession[sk] = mkCont();
        contSession[sk].waste.push(wErr);
        contStrain[strainKey].waste.push(wErr);

        if (hasBoutData) {
          const gt = boutsByVisit.get(v.visit_id) ?? [];
          const pred = predictedBoutsFromPeriods(
            r.periods,
            v.sample_rate_hz,
          );
          const { tp, fp, fn } = greedyBoutPairing(gt, pred, 0.5);
          boutTp += tp;
          boutFp += fp;
          boutFn += fn;
        }
      }

      const elimConf = buildConfusionAndRates(elimPairs);
      const bySessionElim: Record<string, { accuracy: number; n: number }> =
        {};
      for (const [k, b] of Object.entries(bySession)) {
        bySessionElim[k] = {
          accuracy: b.n ? b.elim_correct / b.n : 0,
          n: b.n,
        };
      }
      const byStrainingElim: Record<
        'true' | 'false',
        { accuracy: number; n: number }
      > = {
        true: {
          accuracy: byStrain.true.n
            ? byStrain.true.elim_correct / byStrain.true.n
            : 0,
          n: byStrain.true.n,
        },
        false: {
          accuracy: byStrain.false.n
            ? byStrain.false.elim_correct / byStrain.false.n
            : 0,
          n: byStrain.false.n,
        },
      };

      const bySessionCat: Record<string, { accuracy: number; n: number }> =
        {};
      for (const [k, b] of Object.entries(bySession)) {
        bySessionCat[k] = {
          accuracy: b.cat_n ? b.cat_correct / b.cat_n : 0,
          n: b.cat_n,
        };
      }
      const byStrainingCat: Record<
        'true' | 'false',
        { accuracy: number; n: number }
      > = {
        true: {
          accuracy: byStrain.true.cat_n
            ? byStrain.true.cat_correct / byStrain.true.cat_n
            : 0,
          n: byStrain.true.cat_n,
        },
        false: {
          accuracy: byStrain.false.cat_n
            ? byStrain.false.cat_correct / byStrain.false.cat_n
            : 0,
          n: byStrain.false.cat_n,
        },
      };

      const boutMetrics = hasBoutData
        ? prf1(boutTp, boutFp, boutFn)
        : { precision: 0, recall: 0, f1: 0 };

      function rollupCont(c: ContAcc): {
        n: number;
        waste_abs_error: { median: number; p90: number; p95: number };
        cat_abs_error_grams: { median: number; p90: number; p95: number };
        cat_within_5pct_rate: number;
        cat_within_n: number;
      } {
        return {
          n: c.waste.length,
          waste_abs_error: quantiles(c.waste),
          cat_abs_error_grams: quantiles(c.catErr),
          cat_within_5pct_rate: c.catWithinN
            ? c.catWithinHit / c.catWithinN
            : 0,
          cat_within_n: c.catWithinN,
        };
      }

      const stratified_continuous = {
        by_session_elimination_type: Object.fromEntries(
          Object.entries(contSession).map(([k, c]) => [k, rollupCont(c)]),
        ),
        by_straining: {
          true: rollupCont(contStrain.true),
          false: rollupCont(contStrain.false),
        },
      };

      const snapshot: MetricsSnapshot = {
        visit_count: visits.length,
        elimination: {
          ...elimConf,
          by_session_elimination_type: bySessionElim,
          by_straining: byStrainingElim,
        },
        cat: {
          accuracy_excluding_unknown_slot: catEval
            ? catCorrect / catEval
            : 0,
          evaluated: catEval,
          by_session_elimination_type: bySessionCat,
          by_straining: byStrainingCat,
        },
        bouts: {
          has_data: hasBoutData,
          tp: boutTp,
          fp: boutFp,
          fn: boutFn,
          precision: boutMetrics.precision,
          recall: boutMetrics.recall,
          f1: boutMetrics.f1,
        },
        continuous: {
          waste_abs_error: quantiles(wasteErrs),
          cat_abs_error_grams: quantiles(catErrs),
          cat_within_5pct_rate: catWithin5N ? catWithin5 / catWithin5N : 0,
          cat_within_n: catWithin5N,
        },
        stratified_continuous,
      };

      printSummary(snapshot);
      await writeFile(
        METRICS_LATEST,
        JSON.stringify(snapshot, null, 2),
        'utf8',
      );

      if (existsSync(METRICS_BASELINE)) {
        const raw = await readFile(METRICS_BASELINE, 'utf8');
        const baseline = JSON.parse(raw) as Partial<MetricsSnapshot>;
        const TH = 0.05;
        const msgs: string[] = [];

        const latestElim = snapshot.elimination.overallAccuracy;
        if (typeof baseline.elimination?.overallAccuracy === 'number') {
          const d = relativeDelta(
            latestElim,
            baseline.elimination.overallAccuracy,
          );
          console.log(
            `delta elimination accuracy (rel): ${(d * 100).toFixed(2)}%`,
          );
          if (
            regressedBeyond(
              latestElim,
              baseline.elimination.overallAccuracy,
              TH,
            )
          ) {
            msgs.push(
              `elimination accuracy regressed >${TH * 100}% rel: ${latestElim} vs ${baseline.elimination.overallAccuracy}`,
            );
          }
        }

        const latestCat = snapshot.cat.accuracy_excluding_unknown_slot;
        if (typeof baseline.cat?.accuracy_excluding_unknown_slot === 'number') {
          const d = relativeDelta(
            latestCat,
            baseline.cat.accuracy_excluding_unknown_slot,
          );
          console.log(`delta cat accuracy (rel): ${(d * 100).toFixed(2)}%`);
          if (
            regressedBeyond(
              latestCat,
              baseline.cat.accuracy_excluding_unknown_slot,
              TH,
            )
          ) {
            msgs.push(
              `cat accuracy regressed >${TH * 100}% rel: ${latestCat} vs ${baseline.cat.accuracy_excluding_unknown_slot}`,
            );
          }
        }

        if (
          baseline.bouts?.has_data &&
          typeof baseline.bouts?.f1 === 'number' &&
          snapshot.bouts.has_data
        ) {
          const d = relativeDelta(snapshot.bouts.f1, baseline.bouts.f1);
          console.log(`delta bout F1 (rel): ${(d * 100).toFixed(2)}%`);
          if (regressedBeyond(snapshot.bouts.f1, baseline.bouts.f1, TH)) {
            msgs.push(
              `bout F1 regressed >${TH * 100}% rel: ${snapshot.bouts.f1} vs ${baseline.bouts.f1}`,
            );
          }
        }

        assert.equal(msgs.length, 0, msgs.join('\n'));
      }
    });
  });
