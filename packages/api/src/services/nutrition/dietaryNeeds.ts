import { isDeepStrictEqual } from 'node:util';

import { subDays } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import type { Kysely } from 'kysely';
import {
  FOOD_PRESETS,
  WATER_PRESETS,
  aahaRer,
  foodFloorKcal,
  intakePetOf,
  resolveFoodBand,
  resolveWaterBand,
  type FoodBand,
  type FoodBandSetting,
  type FoodPreset,
  type IntakeGap,
  type WaterBand,
  type WaterBandSetting,
  type WaterPreset,
} from 'shared';

import type { Database } from '../../database/index.ts';
import type { NewEvent } from '../../database/types/EventTable.ts';
import type { PetAltered } from '../../database/types/PetTable.ts';
import { parseStoredEventData } from '../../database/types/storedEventData.ts';
import { attributionColumns } from '../../domain/eventAttribution.ts';
import type {
  IntakeTargetEventData,
  WeightTargetEventData,
} from '../../domain/events.ts';
import { formatBirthDate } from '../../helpers/birthDate.ts';
import {
  BAND_WEIGHT_WINDOW_DAYS,
  bandWeightG,
  targetsAt,
  type TargetEvent,
  type TargetsInEffect,
  type WeighIn,
} from './intakeTargets.ts';

/** A band, or the reason a preset has none. */
type Outcome<Band> = Band | { gap: IntakeGap };

/** The food band as it resolves on one day, with what the page shows beside it. */
export interface FoodResolution {
  band: Outcome<FoodBand>;
  /** Every notch, in slider order. */
  presets: { preset: FoodPreset; outcome: Outcome<FoodBand> }[];
  floorKcal: number;
  /** Her resting energy need at her current weight, in whole kcal. */
  restingKcal: number;
}

/** The water band as it resolves on one day. */
export interface WaterResolution {
  band: Outcome<WaterBand>;
  /** Every notch, in slider order. */
  presets: { preset: WaterPreset; outcome: Outcome<WaterBand> }[];
}

/** A pet's dietary needs on one day: what is set, and what it resolves to. */
export interface DietaryNeeds {
  targets: TargetsInEffect;
  /** The weight the bands are worked out at; null when she has never been weighed. */
  weightG: number | null;
  /** Null without a weight, since every band needs one. */
  food: FoodResolution | null;
  water: WaterResolution | null;
}

/** The pet fields a band depends on. */
interface NeedsPet {
  birth_date: Date | string | null;
  altered: PetAltered;
}

/** When to resolve for: the moment, and the zone its calendar day is read in. */
export interface ResolveAt {
  now: Date;
  timezone: string;
}

/** A pet's dietary needs as of `at`, or undefined when there is no such pet. */
export async function loadDietaryNeeds(
  db: Kysely<Database>,
  petId: number,
  at: ResolveAt,
): Promise<DietaryNeeds | undefined> {
  const [pet, targetEvents, weighIns] = await Promise.all([
    db
      .selectFrom('pet')
      .select(['birth_date', 'altered'])
      .where('id', '=', petId)
      .executeTakeFirst(),
    loadTargetEvents(db, petId, at.now),
    loadWeighIns(db, petId, at.now),
  ]);
  if (!pet) return undefined;

  const targets = targetsAt(targetEvents, at.now);
  const weightG = bandWeightG(weighIns, at.now);
  const on = formatInTimeZone(at.now, at.timezone, 'yyyy-MM-dd');
  return resolveDietaryNeeds(pet, targets, weightG, on);
}

/** What the request to change a pet's dietary needs may carry; a part left out stays as it is. */
export interface DietaryNeedsChange {
  food?: { tracked: boolean; setting: FoodBandSetting };
  water?: { tracked: boolean; setting: WaterBandSetting };
  /** Null clears the target weight. */
  targetWeightG?: number | null;
}

/**
 * Appends one event for each part of `change` that differs from what is in
 * effect, all at `at.now`, and returns the needs as they then resolve. A band
 * keeps the plan it already had, so saving never moves a pet to a newer
 * default. Undefined when there is no such pet.
 */
export async function saveDietaryNeeds(
  db: Kysely<Database>,
  petId: number,
  change: DietaryNeedsChange,
  at: ResolveAt,
): Promise<DietaryNeeds | undefined> {
  return db.transaction().execute(async (trx) => {
    const [pet, targetEvents] = await Promise.all([
      trx
        .selectFrom('pet')
        .select('id')
        .where('id', '=', petId)
        .executeTakeFirst(),
      loadTargetEvents(trx, petId, at.now),
    ]);
    if (!pet) return undefined;

    const current = targetsAt(targetEvents, at.now);
    const events = changedTargets(current, change).map((data) =>
      targetEvent(petId, data, at.now),
    );
    if (events.length > 0) {
      await trx.insertInto('event').values(events).execute();
    }
    return loadDietaryNeeds(trx, petId, at);
  });
}

/** The snapshots to append: one for each part of `change` that differs from `current`. */
function changedTargets(
  current: TargetsInEffect,
  change: DietaryNeedsChange,
): (IntakeTargetEventData | WeightTargetEventData)[] {
  const changed: (IntakeTargetEventData | WeightTargetEventData)[] = [];

  if (change.food && !sameBand(current.food, change.food)) {
    changed.push({
      type: 'intake_target',
      kind: 'food',
      measure: 'amount',
      plan: current.food.plan,
      ...change.food,
    });
  }
  if (change.water && !sameBand(current.water, change.water)) {
    changed.push({
      type: 'intake_target',
      kind: 'water',
      measure: 'amount',
      plan: current.water.plan,
      ...change.water,
    });
  }
  if (
    change.targetWeightG !== undefined &&
    change.targetWeightG !== current.targetWeightG
  ) {
    changed.push({ type: 'weight_target', target_g: change.targetWeightG });
  }
  return changed;
}

/** Whether a band as set already is what a change asks for. */
function sameBand(
  current: { tracked: boolean; setting: unknown },
  change: { tracked: boolean; setting: unknown },
): boolean {
  return (
    current.tracked === change.tracked &&
    isDeepStrictEqual(current.setting, change.setting)
  );
}

/** A target event about `petId`, taking effect and recorded at `now`. */
function targetEvent(
  petId: number,
  data: IntakeTargetEventData | WeightTargetEventData,
  now: Date,
): NewEvent {
  return {
    ...attributionColumns('pet', petId, 'manual'),
    device_id: null,
    parent_event_id: null,
    timestamp: now,
    recorded_at: now,
    data,
    raw_data: null,
    human_verified: true,
  };
}

/** Every target event of a pet up to `until`, oldest first. Each type reads its own partial index. */
async function loadTargetEvents(
  db: Kysely<Database>,
  petId: number,
  until: Date,
): Promise<TargetEvent[]> {
  const eventsOf = (type: 'intake_target' | 'weight_target') =>
    db
      .selectFrom('event')
      .select(['id', 'timestamp', 'data'])
      .where('pet_id', '=', petId)
      .where('type', '=', type)
      .where('timestamp', '<=', until)
      .execute();
  const [intake, weight] = await Promise.all([
    eventsOf('intake_target'),
    eventsOf('weight_target'),
  ]);

  const events: (TargetEvent & { id: number })[] = [];
  for (const row of [...intake, ...weight]) {
    const data = parseStoredEventData(row.data);
    if (data?.type !== 'intake_target' && data?.type !== 'weight_target') {
      continue;
    }
    events.push({ id: row.id, at: row.timestamp, data });
  }
  return events.sort((a, b) => a.at.getTime() - b.at.getTime() || a.id - b.id);
}

/**
 * The weigh-ins `bandWeightG` needs as of `until`, oldest first: the window
 * before it, and the last one before the window in case the window is empty.
 */
async function loadWeighIns(
  db: Kysely<Database>,
  petId: number,
  until: Date,
): Promise<WeighIn[]> {
  const windowStart = subDays(until, BAND_WEIGHT_WINDOW_DAYS);
  const weighIns = () =>
    db
      .selectFrom('event')
      .select(['timestamp', 'data'])
      .where('pet_id', '=', petId)
      .where('type', '=', 'weight_measurement');
  const [inWindow, lastBefore] = await Promise.all([
    weighIns()
      .where('timestamp', '>', windowStart)
      .where('timestamp', '<=', until)
      .orderBy('timestamp', 'asc')
      .execute(),
    weighIns()
      .where('timestamp', '<=', windowStart)
      .orderBy('timestamp', 'desc')
      .limit(1)
      .execute(),
  ]);

  const result: WeighIn[] = [];
  for (const row of [...lastBefore, ...inWindow]) {
    const data = parseStoredEventData(row.data);
    if (data?.type !== 'weight_measurement') continue;
    result.push({ at: row.timestamp, grams: data.weight });
  }
  return result;
}

/** `targets` resolved for a pet weighing `weightG` on the calendar day `on`. */
export function resolveDietaryNeeds(
  pet: NeedsPet,
  targets: TargetsInEffect,
  weightG: number | null,
  on: string,
): DietaryNeeds {
  if (weightG === null) {
    return { targets, weightG, food: null, water: null };
  }

  const { targetWeightG } = targets;
  const intakePet = intakePetOf(
    {
      birthDate: formatBirthDate(pet.birth_date),
      altered: pet.altered,
      kg: weightG / 1000,
      targetKg: targetWeightG === null ? null : targetWeightG / 1000,
    },
    on,
  );
  const { food, water } = targets;

  return {
    targets,
    weightG,
    food: {
      band: resolveFoodBand(food.setting, food.plan, intakePet),
      presets: FOOD_PRESETS.map((preset) => ({
        preset,
        outcome: resolveFoodBand({ preset }, food.plan, intakePet),
      })),
      floorKcal: foodFloorKcal(intakePet),
      restingKcal: Math.round(aahaRer(intakePet.kg)),
    },
    water: {
      band: resolveWaterBand(water.setting, water.plan, intakePet),
      presets: WATER_PRESETS.map((preset) => ({
        preset,
        outcome: resolveWaterBand({ preset }, water.plan, intakePet),
      })),
    },
  };
}
