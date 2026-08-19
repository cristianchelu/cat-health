import { sql } from 'kysely';

import type { Database } from '../../../../database/index.ts';
import type { LitterboxUseEventData } from '../../../../domain/events.ts';
import type { Kysely } from 'kysely';

import { decodeLitterboxRawData, deriveLitterboxSampleRateHz } from 'shared';
import { persistedLitterboxSegments } from './persistedLitterboxSegments.ts';
import {
  StateAnalyzer,
  determineEliminationType,
  type StateResult,
} from './StateAnalyzer.ts';

const NO_ELIMINATION_THRESHOLD = 10;

/** Merge `StateAnalyzer` output into persisted litterbox visit `data` (segments, type, straining). */
export function mergeAnalyzerIntoLitterboxData(
  existing: LitterboxUseEventData,
  analysis: StateResult,
  sampleRateHz?: number,
): LitterboxUseEventData {
  const eliminationType = determineEliminationType(analysis.periods);
  const ew = existing.elimination_weight;
  const straining =
    eliminationType !== 'no_elimination' && ew < NO_ELIMINATION_THRESHOLD;
  const segments = persistedLitterboxSegments(analysis.periods);

  return {
    ...existing,
    elimination_type: eliminationType,
    straining,
    segments,
    ...(sampleRateHz !== undefined ? { sample_rate_hz: sampleRateHz } : {}),
  };
}

export async function getLatestPetWeightsGrams(
  db: Kysely<Database>,
  beforeTimestamp: Date,
): Promise<Map<number, number>> {
  const latestWeights = new Map<number, number>();

  const weightEvents = await db
    .selectFrom('event')
    .select(['pet_id', 'data', 'timestamp'])
    .where('timestamp', '<', beforeTimestamp)
    .where('pet_id', 'is not', null)
    .where(sql`json_extract(data, '$.type')`, '=', 'weight_measurement')
    .orderBy('timestamp', 'desc')
    .execute();

  const petLatestWeights = new Map<
    number,
    { weight: number; timestamp: Date }
  >();

  for (const event of weightEvents) {
    if (event.pet_id !== null) {
      const petId = event.pet_id;
      const eventData = event.data;

      if (
        eventData.type === 'weight_measurement' &&
        typeof eventData.weight === 'number'
      ) {
        if (
          !petLatestWeights.has(petId) ||
          event.timestamp > petLatestWeights.get(petId)!.timestamp
        ) {
          petLatestWeights.set(petId, {
            weight: eventData.weight,
            timestamp: event.timestamp,
          });
        }
      }
    }
  }

  for (const [petId, data] of petLatestWeights) {
    latestWeights.set(petId, data.weight);
  }

  return latestWeights;
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
    (await getLatestPetWeightsGrams(db, params.timestamp)).values(),
  );
  const analyzer = new StateAnalyzer(knownWeights);
  const analysis = analyzer.processEvent(weights);

  const sampleRateHz = deriveLitterboxSampleRateHz(
    decoded,
    params.existing.duration,
  );

  return {
    ok: true,
    data: mergeAnalyzerIntoLitterboxData(params.existing, analysis, sampleRateHz),
  };
}
