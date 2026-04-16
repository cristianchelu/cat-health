/**
 * Export litterbox_use events from SQLite into text fixtures
 * matching esp32-litterbox-visits-test-plan.md (streams/, visits.csv, bouts.csv).
 *
 * Run from packages/api:
 *   node --experimental-strip-types src/services/devices/providers/esphome/test/exportHumanVerifiedLitterboxFixtures.ts --out src/services/devices/providers/esphome/test
 *
 * Options:
 *   --out <dir>     Output directory (default: ./test under this file's directory)
 *   --limit <n>   Max visits to export (default: 50)
 *   --db <path>   SQLite file (default: SQLITE_PATH env or repo data/database.sqlite)
 *   --no-clean    Do not delete existing streams/*.txt (and legacy *.csv) before writing
 *   --selection verified|annotated|any
 *                 verified (default): human_verified litterbox_use rows only
 *                 annotated: rows with persisted data.annotation (may be unverified)
 *                 any: human_verified OR annotation present
 *
 * When annotation.bouts is non-empty, rows are written to bouts.csv and
 * bout_annotation_level=per_bout; otherwise bout_annotation_level=session_only.
 *
 * Visits with data.annotation.excluded === true are omitted (bad data flagged in the UI).
 */

import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sql, type Kysely } from 'kysely';
import { decodeLitterboxRawData } from 'shared';

import type { Database } from '../../../../../database/index.ts';
import type { LitterboxUseEventData } from '../../../../../database/types/EventTable.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_OUT = path.join(__dirname, 'test');
const SAMPLE_RATE_FALLBACK_HZ = 10;

function csvEscape(value: string | number | boolean): string {
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

type FixtureSelection = 'verified' | 'annotated' | 'any';

function parseArgs(argv: string[]) {
  let outDir = DEFAULT_OUT;
  let limit = 50;
  let clean = true;
  let dbPath: string | undefined;
  let selection: FixtureSelection = 'verified';
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out' && argv[i + 1]) {
      outDir = path.resolve(argv[++i]);
    } else if (a === '--limit' && argv[i + 1]) {
      limit = Math.max(1, parseInt(argv[++i], 10) || 50);
    } else if (a === '--db' && argv[i + 1]) {
      dbPath = path.resolve(argv[++i]);
    } else if (a === '--no-clean') {
      clean = false;
    } else if (a === '--selection' && argv[i + 1]) {
      const v = argv[++i].toLowerCase();
      if (v === 'verified' || v === 'annotated' || v === 'any') {
        selection = v;
      } else {
        console.warn(`Unknown --selection ${v}; using verified`);
      }
    }
  }
  return { outDir, limit, clean, dbPath, selection };
}

async function getLatestPetWeightsGrams(
  db: Kysely<Database>,
  before: Date,
): Promise<Map<number, number>> {
  const rows = await db
    .selectFrom('event')
    .select(['pet_id', 'data', 'timestamp'])
    .where('timestamp', '<', before)
    .where('pet_id', 'is not', null)
    .where(sql<string>`json_extract(data, '$.type')`, '=', 'weight_measurement')
    .orderBy('timestamp', 'desc')
    .execute();

  const petLatest = new Map<number, { weight: number; timestamp: Date }>();

  for (const event of rows) {
    if (event.pet_id === null) continue;
    const eventData = event.data;
    if (
      typeof eventData === 'object' &&
      eventData !== null &&
      'type' in eventData &&
      eventData.type === 'weight_measurement' &&
      'weight' in eventData &&
      typeof eventData.weight === 'number'
    ) {
      const petId = event.pet_id;
      const prev = petLatest.get(petId);
      if (!prev || event.timestamp > prev.timestamp) {
        petLatest.set(petId, { weight: eventData.weight, timestamp: event.timestamp });
      }
    }
  }

  const out = new Map<number, number>();
  for (const [petId, { weight }] of petLatest) {
    out.set(petId, weight);
  }
  return out;
}

function groundTruthCatSlot(
  petId: number | null,
  sortedPetIds: number[],
): number {
  if (petId === null) return -1;
  const idx = sortedPetIds.indexOf(petId);
  return idx >= 0 ? idx : -1;
}

async function exportFixtures(
  db: Kysely<Database>,
  opts: { outDir: string; limit: number; clean: boolean; selection: FixtureSelection },
) {
  const { outDir, limit, clean, selection } = opts;
  const streamsDir = path.join(outDir, 'streams');
  await mkdir(streamsDir, { recursive: true });

  if (clean) {
    try {
      const names = await readdir(streamsDir);
      await Promise.all(
        names
          .filter((f) => f.endsWith('.txt') || f.endsWith('.csv'))
          .map((f) => rm(path.join(streamsDir, f))),
      );
    } catch {
      // ignore
    }
  }

  const base = db
    .selectFrom('event')
    .selectAll()
    .where(sql<string>`json_extract(data, '$.type')`, '=', 'litterbox_use')
    .where('parent_event_id', 'is', null);

  const events =
    selection === 'verified'
      ? await base
        .where('human_verified', '=', true)
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .execute()
      : selection === 'annotated'
        ? await base
          .where(sql`json_extract(data, '$.annotation')`, 'is not', null)
          .orderBy('timestamp', 'desc')
          .limit(limit)
          .execute()
        : await base
          .where(
            sql<boolean>`(human_verified = 1 OR json_extract(data, '$.annotation') IS NOT NULL)`,
          )
          .orderBy('timestamp', 'desc')
          .limit(limit)
          .execute();

  const visitRows: string[] = [
    [
      'visit_id',
      'household_id',
      'contributor_anon_id',
      'stream_relpath',
      'sample_rate_hz',
      'session_elimination_type',
      'ground_truth_cat_slot',
      'known_kg_json',
      'straining',
      'bout_annotation_level',
    ].join(','),
  ];

  const boutRows: string[] = [
    ['visit_id', 'bout_index', 't_start_s', 't_end_s', 'bout_type'].join(','),
  ];

  let exported = 0;
  let skipped = 0;

  for (const event of events) {
    const data = event.data as LitterboxUseEventData;
    if (data.type !== 'litterbox_use') {
      skipped++;
      continue;
    }

    if (data.annotation?.excluded === true) {
      console.warn(`skip event ${event.id}: excluded from annotation export`);
      skipped++;
      continue;
    }

    const decoded = decodeLitterboxRawData(event.raw_data);
    if (!decoded || decoded.weights.length === 0) {
      console.warn(`skip event ${event.id}: no decodable weight stream`);
      skipped++;
      continue;
    }

    const visitId = `e${event.id}`;
    const streamRel = `streams/${visitId}.txt`;
    const householdId =
      event.device_id !== null ? `d${event.device_id}` : 'd0';

    const latest = await getLatestPetWeightsGrams(db, event.timestamp);
    const pairs = [...latest.entries()].map(([petId, g]) => ({ petId, g }));
    pairs.sort((a, b) => a.g - b.g);
    const knownKgJson = JSON.stringify(pairs.map((p) => Math.round((p.g / 1000) * 1e6) / 1e6));
    const sortedPetIds = pairs.map((p) => p.petId);
    const catSlot = groundTruthCatSlot(event.pet_id, sortedPetIds);

    const durationS =
      typeof data.duration === 'number' && data.duration > 0
        ? data.duration
        : Math.max(1, decoded.weights.length - 1) / SAMPLE_RATE_FALLBACK_HZ;

    const sampleRateHz =
      decoded.weights.length > 1 && durationS > 0
        ? Math.round(((decoded.weights.length - 1) / durationS) * 1000) / 1000
        : SAMPLE_RATE_FALLBACK_HZ;

    // One tenth-gram integer per line; line index i → time i / sample_rate_hz (Hz from visits.csv).
    const body = decoded.weights
      .map((w) => String(Math.round(w * 10)))
      .join('\n');
    await writeFile(path.join(outDir, streamRel), `${body}\n`, 'utf8');

    const annBouts = data.annotation?.bouts ?? [];
    const boutLevel =
      annBouts.length > 0 ? 'per_bout' : 'session_only';

    visitRows.push(
      [
        csvEscape(visitId),
        csvEscape(householdId),
        csvEscape(''),
        csvEscape(streamRel),
        csvEscape(sampleRateHz),
        csvEscape(data.elimination_type),
        csvEscape(catSlot),
        csvEscape(knownKgJson),
        csvEscape(Boolean(data.straining)),
        csvEscape(boutLevel),
      ].join(','),
    );

    const sortedBouts = [...annBouts].sort((a, b) => a.bout_index - b.bout_index);
    for (const bout of sortedBouts) {
      boutRows.push(
        [
          csvEscape(visitId),
          csvEscape(bout.bout_index),
          csvEscape(bout.t_start_s),
          csvEscape(bout.t_end_s),
          csvEscape(bout.bout_type),
        ].join(','),
      );
    }

    exported++;
  }

  await writeFile(path.join(outDir, 'visits.csv'), visitRows.join('\n') + '\n', 'utf8');
  await writeFile(path.join(outDir, 'bouts.csv'), boutRows.join('\n') + '\n', 'utf8');

  console.log(
    `Wrote ${exported} visits to ${outDir} (streams/, visits.csv, bouts.csv). Skipped ${skipped}. selection=${selection}`,
  );
  console.log(
    'Ground truth: session_elimination_type and cat slot from event row; per-bout rows in bouts.csv when data.annotation.bouts is present.',
  );
}

async function main() {
  const opts = parseArgs(process.argv);
  if (opts.dbPath) {
    process.env.SQLITE_PATH = opts.dbPath;
  }
  const { db } = await import('../../../../../database/index.ts');
  try {
    await exportFixtures(db, opts);
  } finally {
    await db.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
