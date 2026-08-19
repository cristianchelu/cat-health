import { sql } from 'kysely';
import type { Kysely } from 'kysely';

import { decodeLitterboxRawData, deriveLitterboxSampleRateHz } from 'shared';

import type { Database } from '../../database/index.ts';
import type { EventTable } from '../../database/types/EventTable.ts';
import type { LitterboxUseEventData, WeightMeasurementEventData } from '../../domain/events.ts';
import {
  getLatestPetWeightsGrams,
  mergeAnalyzerIntoLitterboxData,
} from '../devices/providers/esphome/analyzeLitterboxUse.ts';
import { StateAnalyzer } from '../devices/providers/esphome/StateAnalyzer.ts';
import {
  attributionColumns,
  isNonPetCause,
} from '../../domain/eventAttribution.ts';
import type { Selectable } from 'kysely';

export interface ReidentifyLitterboxVisitsResult {
  processed: number;
  updated_pet: number;
  updated_weight: number;
  updated_analysis: number;
  skipped: number;
}

function litterboxDataAnalysisChanged(
  before: LitterboxUseEventData,
  after: LitterboxUseEventData,
): boolean {
  return (
    before.elimination_type !== after.elimination_type ||
    (before.straining ?? false) !== (after.straining ?? false) ||
    before.sample_rate_hz !== after.sample_rate_hz ||
    JSON.stringify(before.segments ?? null) !== JSON.stringify(after.segments ?? null)
  );
}

async function reidentifyOneVisit(
  db: Kysely<Database>,
  row: Selectable<EventTable>,
): Promise<
  'skipped' | { petChanged: boolean; weightChanged: boolean; analysisChanged: boolean }
> {
  const existing = row.data as LitterboxUseEventData;
  if (existing.type !== 'litterbox_use') {
    return 'skipped';
  }

  const decoded = row.raw_data
    ? decodeLitterboxRawData(
        new Uint8Array(
          row.raw_data.buffer,
          row.raw_data.byteOffset,
          row.raw_data.byteLength,
        ),
      )
    : null;
  const weights = decoded?.weights;
  if (!weights?.length) {
    return 'skipped';
  }

  const latestPetWeights = await getLatestPetWeightsGrams(db, row.timestamp);
  const knownWeights = Array.from(latestPetWeights.values()).sort(
    (a, b) => a - b,
  );
  const petIdsByWeight = new Map<number, number>();
  for (const [pid, w] of latestPetWeights) {
    petIdsByWeight.set(w, pid);
  }

  const sampleRateHz = deriveLitterboxSampleRateHz(decoded, existing.duration);
  const analyzer = new StateAnalyzer(knownWeights, sampleRateHz);
  const analysis = analyzer.processEvent(weights);

  // A visit already attributed to something other than a pet — the vacuum
  // knocked the box, someone scooped it — must not be re-attributed by weight,
  // or every re-run hands back the guess a human already rejected. Only the
  // attribution freezes; the analysis below still refreshes.
  const attributionFrozen = isNonPetCause(row.caused_by);

  let newPetId: number | null = null;
  if (
    !attributionFrozen &&
    analysis.detectedCatIndex >= 0 &&
    analysis.detectedCatIndex < knownWeights.length
  ) {
    const detectedWeight = knownWeights[analysis.detectedCatIndex];
    newPetId = petIdsByWeight.get(detectedWeight) ?? null;
  }

  const petChanged = !attributionFrozen && row.pet_id !== newPetId;

  const newData = row.human_verified
    ? existing
    : mergeAnalyzerIntoLitterboxData(existing, analysis, sampleRateHz);
  const analysisChanged =
    !row.human_verified && litterboxDataAnalysisChanged(existing, newData);

  if (petChanged || analysisChanged) {
    await db
      .updateTable('event')
      .set({
        // Weight is the whole basis for this pass, so it is what gets recorded.
        // Losing a match returns the visit to unresolved rather than asserting
        // a cause the analyzer never established.
        ...(petChanged
          ? attributionColumns(
              newPetId !== null ? 'pet' : 'unknown',
              newPetId,
              newPetId !== null ? 'weight' : null,
            )
          : {}),
        data: newData,
      })
      .where('id', '=', row.id)
      .execute();
  }

  const weightChild = await db
    .selectFrom('event')
    .selectAll()
    .where('parent_event_id', '=', row.id)
    .where(sql`json_extract(data, '$.type')`, '=', 'weight_measurement')
    .executeTakeFirst();

  const newWeightGrams =
    newPetId !== null && analysis.catWeight > 0
      ? Math.round(analysis.catWeight)
      : null;

  let weightChanged = false;

  if (newWeightGrams !== null) {
    const weightData: WeightMeasurementEventData = {
      type: 'weight_measurement',
      weight: newWeightGrams,
    };
    // A weight reading only exists when the analyzer matched a pet, so the
    // child always carries that same pet on the same basis as its parent.
    const weightAttribution = attributionColumns('pet', newPetId, 'weight');
    if (weightChild) {
      const oldData = weightChild.data as WeightMeasurementEventData;
      if (oldData.weight !== newWeightGrams || weightChild.pet_id !== newPetId) {
        await db
          .updateTable('event')
          .set({ ...weightAttribution, data: weightData })
          .where('id', '=', weightChild.id)
          .execute();
        weightChanged = true;
      }
    } else {
      await db
        .insertInto('event')
        .values({
          parent_event_id: row.id,
          ...weightAttribution,
          device_id: row.device_id,
          timestamp: row.timestamp,
          data: weightData,
          raw_data: null,
          human_verified: false,
        })
        .execute();
      weightChanged = true;
    }
  } else if (weightChild) {
    await db.deleteFrom('event').where('id', '=', weightChild.id).execute();
    weightChanged = true;
  }

  return { petChanged, weightChanged, analysisChanged };
}

export async function reidentifyLitterboxVisits(
  db: Kysely<Database>,
  deviceId: number,
  after: Date,
): Promise<ReidentifyLitterboxVisitsResult> {
  const visits = await db
    .selectFrom('event')
    .selectAll()
    .where('device_id', '=', deviceId)
    .where('parent_event_id', 'is', null)
    .where(sql`json_extract(data, '$.type')`, '=', 'litterbox_use')
    .where('timestamp', '>', after)
    .orderBy('timestamp', 'asc')
    .execute();

  let updated_pet = 0;
  let updated_weight = 0;
  let updated_analysis = 0;
  let skipped = 0;

  for (const row of visits) {
    const result = await reidentifyOneVisit(db, row);
    if (result === 'skipped') {
      skipped += 1;
    } else {
      if (result.petChanged) updated_pet += 1;
      if (result.weightChanged) updated_weight += 1;
      if (result.analysisChanged) updated_analysis += 1;
    }
  }

  return {
    processed: visits.length,
    updated_pet,
    updated_weight,
    updated_analysis,
    skipped,
  };
}
