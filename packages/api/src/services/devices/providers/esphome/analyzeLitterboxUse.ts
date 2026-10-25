import { sql } from 'kysely';

import type { Database } from '../../../../database/index.ts';
import type { LitterboxUseEventData } from '../../../../domain/events.ts';
import type { Kysely } from 'kysely';

import {
  decodeLitterboxRawData,
  deriveLitterboxSampleRateHz,
  type LitterboxUseEliminationType,
} from 'shared';
import { attributionCandidatesAt } from '../../../events/petPresence.ts';
import { persistedLitterboxSegments } from './persistedLitterboxSegments.ts';
import {
  StateAnalyzer,
  determineEliminationType,
  type StateResult,
} from './StateAnalyzer.ts';

const NO_ELIMINATION_THRESHOLD = 10;

/** An elimination was detected but almost nothing landed in the litter. */
export function isStraining(
  eliminationType: LitterboxUseEliminationType,
  eliminationWeightG: number,
): boolean {
  return (
    eliminationType !== 'no_elimination' &&
    eliminationWeightG < NO_ELIMINATION_THRESHOLD
  );
}

/** Merge `StateAnalyzer` output into persisted litterbox visit `data` (segments, type, straining). */
export function mergeAnalyzerIntoLitterboxData(
  existing: LitterboxUseEventData,
  analysis: StateResult,
  sampleRateHz?: number,
): LitterboxUseEventData {
  const eliminationType = determineEliminationType(analysis.periods);
  const straining = isStraining(eliminationType, existing.elimination_weight);
  const segments = persistedLitterboxSegments(analysis.periods);

  return {
    ...existing,
    elimination_type: eliminationType,
    straining,
    segments,
    ...(sampleRateHz !== undefined ? { sample_rate_hz: sampleRateHz } : {}),
  };
}

/**
 * Each pet's latest weight strictly before `beforeTimestamp`. One seek per pet
 * on `idx_event_pet_weight`, which the `json_extract` term must match.
 */
/**
 * One pet's latest weight event before `before`: a single seek on
 * `idx_event_pet_weight`, which the `json_extract` term must match to be used.
 */
export function latestWeightQuery(
  db: Kysely<Database>,
  petId: number,
  before: Date,
) {
  return db
    .selectFrom('event')
    .select(['pet_id', 'data'])
    .where('pet_id', '=', petId)
    .where(sql`json_extract(data, '$.type')`, '=', 'weight_measurement')
    .where('timestamp', '<', before)
    .orderBy('timestamp', 'desc')
    .orderBy('id', 'desc')
    .limit(1);
}

export async function getLatestPetWeightsGrams(
  db: Kysely<Database>,
  beforeTimestamp: Date,
  petIds?: readonly number[],
): Promise<Map<number, number>> {
  const ids =
    petIds ??
    (await db.selectFrom('pet').select('id').execute()).map((pet) => pet.id);

  const rows = await Promise.all(
    ids.map((petId) =>
      latestWeightQuery(db, petId, beforeTimestamp).executeTakeFirst(),
    ),
  );

  const latestWeights = new Map<number, number>();
  for (const row of rows) {
    if (
      row?.pet_id != null &&
      row.data.type === 'weight_measurement' &&
      typeof row.data.weight === 'number'
    ) {
      latestWeights.set(row.pet_id, row.data.weight);
    }
  }
  return latestWeights;
}

/**
 * The litterbox's candidate roster for a visit at `at`: latest weights of the
 * pets `isAttributionCandidate` allows at that moment.
 */
export async function getLitterboxCandidateWeights(
  db: Kysely<Database>,
  at: Date,
): Promise<Map<number, number>> {
  const petIds = (await db.selectFrom('pet').select('id').execute()).map(
    (pet) => pet.id,
  );
  const [weights, candidates] = await Promise.all([
    getLatestPetWeightsGrams(db, at, petIds),
    attributionCandidatesAt(db, petIds, at),
  ]);
  return new Map([...weights].filter(([petId]) => candidates.has(petId)));
}

/**
 * Run `StateAnalyzer` with the same pet-weight context as device ingest; returns merged `data` for persistence.
 */
export async function computeLitterboxAnalysisData(
  db: Kysely<Database>,
  params: {
    timestamp: Date;
    raw_data: Buffer | null;
    existing: LitterboxUseEventData;
  },
): Promise<
  | { ok: true; data: LitterboxUseEventData }
  | { ok: false; error: 'no_raw_data' | 'decode_failed' }
> {
  const decoded = params.raw_data
    ? decodeLitterboxRawData(
        new Uint8Array(
          params.raw_data.buffer,
          params.raw_data.byteOffset,
          params.raw_data.byteLength,
        ),
      )
    : null;
  const weights = decoded?.weights ?? null;
  if (!weights?.length) {
    return params.raw_data && params.raw_data.length > 0
      ? { ok: false, error: 'decode_failed' }
      : { ok: false, error: 'no_raw_data' };
  }

  const knownWeights = Array.from(
    (await getLitterboxCandidateWeights(db, params.timestamp)).values(),
  );
  const sampleRateHz = deriveLitterboxSampleRateHz(
    decoded,
    params.existing.duration,
  );
  const analyzer = new StateAnalyzer(knownWeights, sampleRateHz);
  const analysis = analyzer.processEvent(weights);

  return {
    ok: true,
    data: mergeAnalyzerIntoLitterboxData(
      params.existing,
      analysis,
      sampleRateHz,
    ),
  };
}
