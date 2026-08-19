/**
 * Fixture loading for the StateAnalyzer harness and tuning studies.
 *
 * The fixtures themselves (visits.csv, streams/*.txt, bouts.csv) are
 * gitignored household telemetry produced by
 * exportHumanVerifiedLitterboxFixtures.ts; see that script for column
 * definitions.
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { LitterboxUseEliminationType } from 'shared';

import { ELIMINATION_CLASSES } from './analyzerHarnessMetrics.ts';

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
export async function loadStream(
  dir: string,
  relpath: string,
): Promise<number[]> {
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
