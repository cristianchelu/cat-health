/**
 * Emit replay_golden.json for StateAnalyzer parity with C++ sa_replay.
 *
 * Usage (from packages/api):
 *   node --experimental-strip-types \
 *     src/services/devices/providers/esphome/test/emitAnalyzerReplayGolden.ts \
 *     --dir src/services/devices/providers/esphome/test \
 *     --out src/services/devices/providers/esphome/test/replay_golden.json
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  determineEliminationType,
  StateAnalyzer,
  type StatePeriod,
} from '../StateAnalyzer.ts';
import { loadStream, loadVisits } from './analyzerHarnessFixtures.ts';
import {
  REPLAY_GOLDEN_SCHEMA_VERSION,
  type ReplayGoldenFile,
  type ReplayGoldenPeriod,
  type ReplayGoldenVisit,
} from './replayGoldenSchema.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Whole grams for cat / waste weights (JSON parity with sa_replay; firmware-friendly). */
function roundGrams(g: number): number {
  return Math.round(g);
}

/**
 * Motion metric (median RMS, g); 0.1 g resolution for JSON / firmware parity.
 * Match C++ float pipeline: analyzer stores std_dev as float before rounding.
 */
function roundVariance(v: number | undefined): number | null {
  if (v === undefined || Number.isNaN(v)) return null;
  const f = Math.fround(v);
  return Math.round(f * 10) / 10;
}

function periodToGolden(p: StatePeriod): ReplayGoldenPeriod {
  return {
    state: p.state,
    start: p.start,
    end: p.end,
    variance:
      p.state === 'eliminating' ? roundVariance(p.variance) : null,
  };
}

function parseArgs(argv: string[]): { dir: string; out: string } {
  let dir = __dirname;
  let out = path.join(__dirname, 'replay_golden.json');
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--dir' && argv[i + 1]) {
      dir = path.resolve(argv[++i]);
    } else if (argv[i] === '--out' && argv[i + 1]) {
      out = path.resolve(argv[++i]);
    }
  }
  return { dir, out };
}

async function main(): Promise<void> {
  const { dir, out } = parseArgs(process.argv);
  const visits = await loadVisits(dir);
  const goldenVisits: ReplayGoldenVisit[] = [];

  for (const v of visits) {
    const weights = await loadStream(dir, v.stream_relpath);
    const analyzer = new StateAnalyzer(v.knownGrams);
    const r = analyzer.processEvent(weights);
    const elimination_type = determineEliminationType(r.periods);

    goldenVisits.push({
      visit_id: v.visit_id,
      elimination_type,
      periods: r.periods.map(periodToGolden),
      cat_weight_g: roundGrams(r.catWeight),
      waste_weight_g: roundGrams(r.wasteWeight),
      detected_cat_index: r.detectedCatIndex,
    });
  }

  goldenVisits.sort((a, b) => a.visit_id.localeCompare(b.visit_id));

  const doc: ReplayGoldenFile = {
    schema_version: REPLAY_GOLDEN_SCHEMA_VERSION,
    visits: goldenVisits,
  };

  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  console.error(
    `Wrote ${goldenVisits.length} visits to ${out} (schema_version=${REPLAY_GOLDEN_SCHEMA_VERSION})`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
