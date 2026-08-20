/**
 * Tuning study: can the analyzer run at each visit's TRUE sample rate
 * (~6.6–7.3Hz) and match the hz=10 benchmark baseline?
 *
 * Sweeps, against the local gitignored fixture set (visits.csv, streams/,
 * bouts.csv — see exportHumanVerifiedLitterboxFixtures.ts):
 *  - urination/defecation variance threshold (T)
 *  - minEliminationSeconds (the eliminating→occupied demotion window)
 *  - rmsWindowSamples: nominal-1s (`round(hz)`) vs the baseline's 10 samples
 *
 * Run:  node --experimental-strip-types src/services/devices/providers/esphome/test/tuneTrueHzThresholds.ts
 *
 * Prints one row per config: elimination accuracy + bout P/R/F1 + presence
 * accuracy, alongside the hz=10 reference computed in the same process.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  StateAnalyzer,
  determineEliminationType,
  type StatePeriod,
} from '../StateAnalyzer.ts';
import {
  greedyBoutPairing,
  prf1,
  type TimeBout,
} from './analyzerHarnessMetrics.ts';
import {
  loadBouts,
  loadStream,
  loadVisits,
  type VisitRow,
} from './analyzerHarnessData.ts';

const FIXTURE_DIR = path.dirname(fileURLToPath(import.meta.url));

interface Config {
  label: string;
  trueHz: boolean;
  minEliminationSeconds: number;
  /** 'nominal' = round(hz) samples (1s at the analyzer's hz); number = fixed. */
  rmsWindow: 'nominal' | number;
  thresholds: number[];
}

interface VisitOutcome {
  visit: VisitRow;
  periods: StatePeriod[];
  predBouts: TimeBout[];
}

function predictedBoutsFromPeriods(
  periods: StatePeriod[],
  sampleRateHz: number,
): TimeBout[] {
  const hz = sampleRateHz > 0 ? sampleRateHz : 10;
  return periods
    .filter((p) => p.state === 'eliminating')
    .map((p) => ({ tStartS: p.start / hz, tEndS: p.end / hz }));
}

async function main(): Promise<void> {
  const visits = await loadVisits(FIXTURE_DIR);
  const boutRows = await loadBouts(FIXTURE_DIR);
  const streams = new Map<string, number[]>();
  for (const v of visits) {
    streams.set(v.visit_id, await loadStream(FIXTURE_DIR, v.stream_relpath));
  }
  const boutsByVisit = new Map<string, TimeBout[]>();
  for (const b of boutRows) {
    const list = boutsByVisit.get(b.visit_id) ?? [];
    list.push({ tStartS: b.t_start_s, tEndS: b.t_end_s });
    boutsByVisit.set(b.visit_id, list);
  }

  const configs: Config[] = [
    // Reference: what production runs today.
    {
      label: 'hz10 (baseline)',
      trueHz: false,
      minEliminationSeconds: 5,
      rmsWindow: 'nominal',
      thresholds: [4],
    },
    // Naive true-hz (the Stage B regression).
    {
      label: 'truehz naive',
      trueHz: true,
      minEliminationSeconds: 5,
      rmsWindow: 'nominal',
      thresholds: [3, 3.5, 4, 4.5, 5, 5.5, 6],
    },
    // Keep the baseline's sample-domain windows, let hz drive only wall-time.
    {
      label: 'truehz rms10',
      trueHz: true,
      minEliminationSeconds: 5,
      rmsWindow: 10,
      thresholds: [3.5, 4, 4.5, 5],
    },
    // Longer demotion window (50 samples ≈ 6.85s at 7.3Hz).
    {
      label: 'truehz demote6.85',
      trueHz: true,
      minEliminationSeconds: 6.85,
      rmsWindow: 'nominal',
      thresholds: [3, 3.5, 4, 4.5, 5, 5.5],
    },
    {
      label: 'truehz demote6.85 rms10',
      trueHz: true,
      minEliminationSeconds: 6.85,
      rmsWindow: 10,
      thresholds: [3.5, 4, 4.5, 5],
    },
    {
      label: 'truehz demote6',
      trueHz: true,
      minEliminationSeconds: 6,
      rmsWindow: 'nominal',
      thresholds: [4, 4.5, 5],
    },
    {
      label: 'truehz demote7',
      trueHz: true,
      minEliminationSeconds: 7,
      rmsWindow: 'nominal',
      thresholds: [3.5, 3.75, 4, 4.25, 4.5],
    },
    {
      label: 'truehz demote7.5',
      trueHz: true,
      minEliminationSeconds: 7.5,
      rmsWindow: 'nominal',
      thresholds: [3.5, 3.75, 4, 4.25, 4.5],
    },
    {
      label: 'truehz demote8',
      trueHz: true,
      minEliminationSeconds: 8,
      rmsWindow: 'nominal',
      thresholds: [3.5, 3.75, 4, 4.25, 4.5, 5],
    },
    {
      label: 'truehz demote8 rms10',
      trueHz: true,
      minEliminationSeconds: 8,
      rmsWindow: 10,
      thresholds: [3.5, 3.75, 4, 4.25, 4.5],
    },
    {
      label: 'truehz demote9',
      trueHz: true,
      minEliminationSeconds: 9,
      rmsWindow: 'nominal',
      thresholds: [3.5, 3.75, 4, 4.25, 4.5],
    },
  ];

  console.log(
    'config'.padEnd(28),
    'T'.padEnd(5),
    'elimAcc'.padEnd(8),
    'boutP'.padEnd(7),
    'boutR'.padEnd(7),
    'boutF1'.padEnd(7),
    'presence'.padEnd(8),
  );

  for (const cfg of configs) {
    const outcomes: VisitOutcome[] = [];
    let presenceCorrect = 0;
    let presenceEval = 0;

    for (const v of visits) {
      const weights = streams.get(v.visit_id)!;
      const hz = cfg.trueHz ? v.sample_rate_hz : 10;
      const analyzer = new StateAnalyzer(v.knownGrams, hz, {
        minEliminationSeconds: cfg.minEliminationSeconds,
        rmsWindowSamples:
          cfg.rmsWindow === 'nominal' ? undefined : cfg.rmsWindow,
      });
      const r = analyzer.processEvent(weights);
      if (v.ground_truth_cat_slot >= 0) {
        presenceEval++;
        if (r.detectedCatIndex === v.ground_truth_cat_slot) presenceCorrect++;
      }
      outcomes.push({
        visit: v,
        periods: r.periods,
        predBouts: predictedBoutsFromPeriods(r.periods, v.sample_rate_hz),
      });
    }

    let boutTp = 0;
    let boutFp = 0;
    let boutFn = 0;
    for (const o of outcomes) {
      // Harness semantics: visits without GT bout rows still contribute —
      // predicted bouts there are false positives.
      const gt = boutsByVisit.get(o.visit.visit_id) ?? [];
      const { tp, fp, fn } = greedyBoutPairing(gt, o.predBouts, 0.5);
      boutTp += tp;
      boutFp += fp;
      boutFn += fn;
    }
    const bouts = prf1(boutTp, boutFp, boutFn);

    for (const t of cfg.thresholds) {
      let correct = 0;
      for (const o of outcomes) {
        const pred = determineEliminationType(o.periods, t);
        if (pred === o.visit.session_elimination_type) correct++;
      }
      console.log(
        cfg.label.padEnd(28),
        String(t).padEnd(5),
        (correct / outcomes.length).toFixed(4).padEnd(8),
        bouts.precision.toFixed(4).padEnd(7),
        bouts.recall.toFixed(4).padEnd(7),
        bouts.f1.toFixed(4).padEnd(7),
        (presenceCorrect / presenceEval).toFixed(4).padEnd(8),
      );
    }
  }
}

await main();
