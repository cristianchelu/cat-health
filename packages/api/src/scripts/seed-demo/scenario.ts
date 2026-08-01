import {
  setHours,
  setMinutes,
  setSeconds,
  startOfDay,
  subDays,
} from 'date-fns';

import type { FoodType } from '../../database/types/FoodTable.ts';
import type { LitterboxUseEliminationType } from 'shared';

import {
  DEFAULT_SEED_DAYS,
  dailyJitter,
  healthyDailyTargets,
  healthyWeightGramsForDay,
  isAcuteUtiDay,
  pseudoRand,
  utiAcuteDayOffset,
  utiAcutePeeSeverity,
  utiDailyTargets,
  utiWeightGramsForDay,
} from './metrics.ts';

export interface SeedFoodDef {
  key: string;
  name: string;
  brand: string;
  food_type: FoodType;
  moisture_percent: number;
  calories_per_100g: number;
}

export interface SeedPetDef {
  key: 'uti' | 'healthy';
  name: string;
  breed: string;
  birth_date: string;
}

export interface SeedDeviceDef {
  key: 'litterbox' | 'fountain' | 'feeder';
  name: string;
  type: 'litterbox' | 'water_fountain' | 'feeder';
  provider: 'esphome';
  external_id: string;
  config: Record<string, unknown>;
}

export interface PlannedVisit {
  petKey: 'uti' | 'healthy';
  dayIndex: number;
  hour: number;
  minute: number;
  eliminationType: LitterboxUseEliminationType;
  eliminationWeightGrams: number;
  /** Active eliminating segment shown in the UI (seconds). */
  eliminationActiveSeconds: number;
  durationSeconds: number;
  straining: boolean;
}

export interface PlannedMeal {
  petKey: 'uti' | 'healthy';
  dayIndex: number;
  hour: number;
  minute: number;
  foodKey: string;
  amountGrams: number;
}

export interface SeedScenarioOptions {
  days: number;
  prefix: string;
}

export interface SeedScenario {
  foods: SeedFoodDef[];
  pets: SeedPetDef[];
  devices: SeedDeviceDef[];
  dayStarts: Date[];
  visits: PlannedVisit[];
  meals: PlannedMeal[];
  fountainSips: Array<{
    petKey: 'uti' | 'healthy';
    dayIndex: number;
    hour: number;
    minute: number;
    amountMl: number;
    durationSeconds: number;
  }>;
  weightCheckIns: Array<{
    petKey: 'uti' | 'healthy';
    dayIndex: number;
    hour: number;
    weightGrams: number;
  }>;
  scoops: Array<{ dayIndex: number; hour: number }>;
  seedNow: Date;
}

const FOODS: SeedFoodDef[] = [
  {
    key: 'salmon_yowlentine',
    name: 'Salmon Yowlentine',
    brand: 'Fancy Feastive',
    food_type: 'complete_wet',
    moisture_percent: 78,
    calories_per_100g: 85,
  },
  {
    key: 'beef_meowleroni',
    name: 'Beef Meowleroni',
    brand: 'Purrvolone',
    food_type: 'complete_wet',
    moisture_percent: 75,
    calories_per_100g: 90,
  },
  {
    key: 'toebeans_kibble',
    name: 'Crunchy Toebeans Kibble',
    brand: 'Hillz Science Diet-ish',
    food_type: 'complete_dry',
    moisture_percent: 8,
    calories_per_100g: 380,
  },
  {
    key: 'tuna_surprise_ii',
    name: 'Tuna Surprise II: Electric Boogaloo',
    brand: 'Whisker Bros',
    food_type: 'complementary_wet',
    moisture_percent: 82,
    calories_per_100g: 70,
  },
  {
    key: 'catnip_chaos',
    name: 'Catnip Chaos Crunchies',
    brand: 'Snack Attack',
    food_type: 'treat',
    moisture_percent: 10,
    calories_per_100g: 400,
  },
];

const PETS: SeedPetDef[] = [
  {
    key: 'uti',
    name: 'Mittens',
    breed: 'Domestic Shorthair',
    birth_date: '2020-03-14',
  },
  {
    key: 'healthy',
    name: 'Reggie',
    breed: 'Maine Coon mix',
    birth_date: '2019-07-04',
  },
];

function withPrefix(prefix: string, name: string): string {
  const trimmed = prefix.trim();
  return trimmed ? `${trimmed} ${name}` : name;
}

function minuteJitter(seed: number, baseMinute: number): number {
  const offset = Math.round((pseudoRand(seed) - 0.5) * 30);
  return Math.min(59, Math.max(0, baseMinute + offset));
}

function peeWeightGrams(
  straining: boolean,
  seed: number,
  acuteSeverity?: number,
): number {
  const jitter = pseudoRand(seed);

  if (acuteSeverity != null && acuteSeverity > 0) {
    if (straining) {
      const maxG = Math.round(22 - acuteSeverity * 14);
      const minG = Math.round(14 - acuteSeverity * 10);
      const lo = Math.max(4, minG);
      const hi = Math.max(lo, maxG);
      return lo + Math.floor(jitter * (hi - lo + 1));
    }
    const maxG = Math.round(48 - acuteSeverity * 26);
    const minG = Math.round(32 - acuteSeverity * 18);
    const lo = Math.max(12, minG);
    const hi = Math.max(lo, maxG);
    return lo + Math.floor(jitter * (hi - lo + 1));
  }

  if (straining) {
    return 10 + Math.floor(jitter * 15);
  }
  return 30 + Math.floor(jitter * 31);
}

function poopWeightGrams(seed: number): number {
  return 15 + Math.floor(pseudoRand(seed) * 21);
}

function peeEliminationSeconds(
  straining: boolean,
  seed: number,
  acutePeeSeverity?: number,
): number {
  if (acutePeeSeverity != null && straining) {
    return 90 + Math.floor(pseudoRand(seed + 1) * 41);
  }
  return 15 + Math.floor(pseudoRand(seed + 1) * 11);
}

function poopEliminationSeconds(seed: number): number {
  return 9 + Math.floor(pseudoRand(seed + 1) * 7);
}

/** Total visit wall time — ramp/occupied/exit padding around the eliminating plateau. */
function visitDurationSeconds(
  eliminationActiveSeconds: number,
  seed: number,
): number {
  if (eliminationActiveSeconds <= 0) {
    return 14 + Math.floor(pseudoRand(seed) * 22);
  }
  return eliminationActiveSeconds + 11;
}

/** Fountain drink duration from volume at 4–14 ml/min (under 15 ml/min). */
function drinkDurationSeconds(amountMl: number, seed: number): number {
  const mlPerMin = 4 + pseudoRand(seed) * 10;
  return Math.max(10, Math.ceil((amountMl / mlPerMin) * 60));
}

/** Waking-hour anchors — visits drift around these, Luna-style. */
const VISIT_ANCHORS = [
  { hour: 6, minute: 45 },
  { hour: 9, minute: 10 },
  { hour: 12, minute: 25 },
  { hour: 15, minute: 40 },
  { hour: 18, minute: 15 },
  { hour: 21, minute: 35 },
  { hour: 23, minute: 5 },
];

function pickAnchors(
  dayIndex: number,
  count: number,
): Array<{ hour: number; minute: number }> {
  const indices = VISIT_ANCHORS.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(pseudoRand(dayIndex * 50 + i) * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(0, count).map((i) => {
    const anchor = VISIT_ANCHORS[i];
    return {
      hour: anchor.hour,
      minute: minuteJitter(dayIndex * 80 + i, anchor.minute),
    };
  });
}

/** Luna-like daily mix: mostly 2–3 eliminations, variable pee/poop split. */
function normalDayCounts(dayIndex: number): { pee: number; poop: number } {
  const roll = pseudoRand(dayIndex * 991);
  if (roll < 0.38) return { pee: 2, poop: 1 };
  if (roll < 0.58) return { pee: 2, poop: 0 };
  if (roll < 0.76) return { pee: 1, poop: 1 };
  if (roll < 0.9) return { pee: 3, poop: 1 };
  if (roll < 0.96) return { pee: 2, poop: 2 };
  return { pee: 3, poop: 0 };
}

function plannedVisitFromSlot(
  petKey: 'uti' | 'healthy',
  dayIndex: number,
  slot: { hour: number; minute: number },
  eliminationType: LitterboxUseEliminationType,
  seed: number,
  straining = false,
  acutePeeSeverity?: number,
): PlannedVisit {
  if (eliminationType === 'no_elimination') {
    const durationSeconds = visitDurationSeconds(0, seed);
    return {
      petKey,
      dayIndex,
      hour: slot.hour,
      minute: slot.minute,
      eliminationType,
      eliminationWeightGrams: 0,
      eliminationActiveSeconds: 0,
      durationSeconds,
      straining: false,
    };
  }

  const isPee = eliminationType === 'urination';
  const eliminationActiveSeconds = isPee
    ? peeEliminationSeconds(straining, seed, acutePeeSeverity)
    : poopEliminationSeconds(seed);
  const durationSeconds = visitDurationSeconds(eliminationActiveSeconds, seed);
  return {
    petKey,
    dayIndex,
    hour: slot.hour,
    minute: slot.minute,
    eliminationType,
    eliminationWeightGrams: isPee
      ? peeWeightGrams(straining, seed, acutePeeSeverity)
      : poopWeightGrams(seed),
    eliminationActiveSeconds,
    durationSeconds,
    straining,
  };
}

function buildNormalPetDay(
  petKey: 'uti' | 'healthy',
  dayIndex: number,
): PlannedVisit[] {
  const { pee, poop } = normalDayCounts(dayIndex);
  const total = pee + poop;
  const anchors = pickAnchors(dayIndex, total);
  const visits: PlannedVisit[] = [];
  let peeLeft = pee;
  let poopLeft = poop;

  for (let i = 0; i < total; i++) {
    const preferPoop =
      poopLeft > 0 &&
      (peeLeft === 0 ||
        pseudoRand(dayIndex * 33 + i) < poopLeft / (peeLeft + poopLeft));
    const type: LitterboxUseEliminationType = preferPoop
      ? 'defecation'
      : 'urination';
    if (type === 'defecation') poopLeft--;
    else peeLeft--;

    visits.push(
      plannedVisitFromSlot(
        petKey,
        dayIndex,
        anchors[i],
        type,
        dayIndex * 100 + i,
      ),
    );
  }

  return visits;
}

function sprinkleHelloVisits(
  visits: PlannedVisit[],
  days: number,
  petKey: 'uti' | 'healthy',
  count: number,
  seedOffset: number,
): void {
  for (let i = 0; i < count; i++) {
    const dayIndex = Math.floor(
      pseudoRand(seedOffset + i * 17) * Math.max(1, days - 2),
    );
    const slot = pickAnchors(dayIndex + i * 3, 1)[0];
    visits.push(
      plannedVisitFromSlot(
        petKey,
        dayIndex,
        { hour: slot.hour + 1, minute: slot.minute },
        'no_elimination',
        seedOffset + i * 41,
      ),
    );
  }
}

function buildVisits(days: number): PlannedVisit[] {
  const visits: PlannedVisit[] = [];

  for (let dayIndex = 0; dayIndex < days; dayIndex++) {
    const acute = isAcuteUtiDay(dayIndex, days);

    visits.push(...buildNormalPetDay('healthy', dayIndex));

    if (!acute) {
      visits.push(...buildNormalPetDay('uti', dayIndex));
      continue;
    }

    const peeSlots = pickAnchors(dayIndex, 7);
    const acuteDayOffset = utiAcuteDayOffset(dayIndex, days)!;
    const acutePees = peeSlots.map((slot, i) => ({
      slot,
      seed: dayIndex * 100 + i,
      straining: i % 5 !== 0,
    }));
    acutePees.sort((a, b) => {
      if (a.slot.hour !== b.slot.hour) return a.slot.hour - b.slot.hour;
      return a.slot.minute - b.slot.minute;
    });
    for (let i = 0; i < acutePees.length; i++) {
      const pee = acutePees[i];
      const severity = utiAcutePeeSeverity(acuteDayOffset, i, acutePees.length);
      visits.push(
        plannedVisitFromSlot(
          'uti',
          dayIndex,
          pee.slot,
          'urination',
          pee.seed,
          pee.straining,
          severity,
        ),
      );
    }
  }

  sprinkleHelloVisits(visits, days, 'healthy', 2, 5000);
  sprinkleHelloVisits(visits, days, 'uti', 1, 6000);

  visits.sort((a, b) => {
    if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex;
    if (a.hour !== b.hour) return a.hour - b.hour;
    return a.minute - b.minute;
  });

  return visits;
}

function moistureMl(food: SeedFoodDef, amountGrams: number): number {
  return amountGrams * (food.moisture_percent / 100);
}

function calories(food: SeedFoodDef, amountGrams: number): number {
  return amountGrams * (food.calories_per_100g / 100);
}

function buildMeals(days: number): PlannedMeal[] {
  const meals: PlannedMeal[] = [];
  const foodByKey = Object.fromEntries(FOODS.map((f) => [f.key, f]));

  for (let dayIndex = 0; dayIndex < days; dayIndex++) {
    const healthyTarget = healthyDailyTargets(dayIndex);
    const utiTarget = utiDailyTargets(dayIndex, days);

    const healthyWet = foodByKey.salmon_yowlentine;
    const healthyDry = foodByKey.toebeans_kibble;
    const wetShare = 0.4 + pseudoRand(dayIndex * 73) * 0.08;
    const wetGrams = Math.round(
      (healthyTarget.calories * wetShare) /
        (healthyWet.calories_per_100g / 100),
    );
    const dryGrams = Math.round(
      (healthyTarget.calories - calories(healthyWet, wetGrams)) /
        (healthyDry.calories_per_100g / 100),
    );

    meals.push(
      {
        petKey: 'healthy',
        dayIndex,
        hour: 8,
        minute: minuteJitter(dayIndex * 79, 0),
        foodKey: 'salmon_yowlentine',
        amountGrams: wetGrams,
      },
      {
        petKey: 'healthy',
        dayIndex,
        hour: 18,
        minute: minuteJitter(dayIndex * 83, 30),
        foodKey: 'toebeans_kibble',
        amountGrams: dryGrams,
      },
    );

    if (pseudoRand(dayIndex * 89) > 0.65) {
      meals.push({
        petKey: 'healthy',
        dayIndex,
        hour: 15,
        minute: minuteJitter(dayIndex * 97, 20),
        foodKey: 'catnip_chaos',
        amountGrams: 4 + Math.floor(pseudoRand(dayIndex * 101) * 4),
      });
    }

    const utiWet = foodByKey.beef_meowleroni;
    const utiDry = foodByKey.toebeans_kibble;
    const utiWetShare = 0.52 + pseudoRand(dayIndex * 103) * 0.1;
    const utiWetGrams = Math.round(
      (utiTarget.calories * utiWetShare) / (utiWet.calories_per_100g / 100),
    );
    const utiDryGrams = Math.max(
      0,
      Math.round(
        (utiTarget.calories - calories(utiWet, utiWetGrams)) /
          (utiDry.calories_per_100g / 100),
      ),
    );

    meals.push({
      petKey: 'uti',
      dayIndex,
      hour: 8,
      minute: minuteJitter(dayIndex * 107, 30),
      foodKey: 'beef_meowleroni',
      amountGrams: utiWetGrams,
    });

    if (utiDryGrams > 0) {
      meals.push({
        petKey: 'uti',
        dayIndex,
        hour: 18,
        minute: minuteJitter(dayIndex * 109, 0),
        foodKey: 'toebeans_kibble',
        amountGrams: utiDryGrams,
      });
    }
  }

  return meals;
}

function splitWithJitter(
  total: number,
  parts: number[],
  seed: number,
): number[] {
  const jittered = parts.map((part, i) => part * dailyJitter(seed + i, 0.12));
  const sum = jittered.reduce((a, b) => a + b, 0);
  return jittered.map((part) => Math.max(1, Math.round((part / sum) * total)));
}

function buildFountainSips(
  days: number,
  meals: PlannedMeal[],
): SeedScenario['fountainSips'] {
  const foodByKey = Object.fromEntries(FOODS.map((f) => [f.key, f]));
  const sips: SeedScenario['fountainSips'] = [];

  for (let dayIndex = 0; dayIndex < days; dayIndex++) {
    const dayMeals = meals.filter((m) => m.dayIndex === dayIndex);
    const moistureFromFood = (petKey: 'uti' | 'healthy') =>
      dayMeals
        .filter((m) => m.petKey === petKey)
        .reduce((sum, meal) => {
          const food = foodByKey[meal.foodKey];
          return sum + moistureMl(food, meal.amountGrams);
        }, 0);

    const healthyWaterTarget = healthyDailyTargets(dayIndex).waterMl;
    const healthyFountain = Math.max(
      40,
      Math.round(healthyWaterTarget - moistureFromFood('healthy')),
    );
    const healthyParts = splitWithJitter(
      healthyFountain,
      [0.28, 0.24, 0.22, 0.26],
      dayIndex * 113,
    );
    const healthyHours = [10, 13, 16, 21];
    healthyParts.forEach((amountMl, i) => {
      sips.push({
        petKey: 'healthy',
        dayIndex,
        hour: healthyHours[i],
        minute: minuteJitter(dayIndex * 117 + i, 10 + i * 7),
        amountMl,
        durationSeconds: drinkDurationSeconds(amountMl, dayIndex * 131 + i),
      });
    });

    const utiWaterTarget = utiDailyTargets(dayIndex, days).waterMl;
    const utiFountain = Math.max(
      20,
      Math.round(utiWaterTarget - moistureFromFood('uti')),
    );
    const utiPartWeights = isAcuteUtiDay(dayIndex, days)
      ? [0.4, 0.35, 0.25]
      : [0.3, 0.25, 0.25, 0.2];
    const utiParts = splitWithJitter(
      utiFountain,
      utiPartWeights,
      dayIndex * 121,
    );
    const utiHours = isAcuteUtiDay(dayIndex, days)
      ? [11, 15, 19]
      : [10, 13, 16, 20];
    utiParts.forEach((amountMl, i) => {
      sips.push({
        petKey: 'uti',
        dayIndex,
        hour: utiHours[i],
        minute: minuteJitter(dayIndex * 127 + i, 5 + i * 11),
        amountMl,
        durationSeconds: drinkDurationSeconds(amountMl, dayIndex * 137 + i),
      });
    });
  }

  return sips;
}

export function buildSeedScenario(options: SeedScenarioOptions): SeedScenario {
  const seedNow = new Date();
  const today = startOfDay(seedNow);
  const dayStarts = Array.from({ length: options.days }, (_, i) =>
    subDays(today, options.days - 1 - i),
  );

  const prefix = options.prefix;
  const pets = PETS.map((pet) => ({
    ...pet,
    name: withPrefix(prefix, pet.name),
  }));

  const devices: SeedDeviceDef[] = [
    {
      key: 'litterbox',
      name: withPrefix(prefix, 'Powder Room Scale'),
      type: 'litterbox',
      provider: 'esphome',
      external_id: 'demo-litterbox-1',
      config: { host: 'litterbox.local', port: 6053 },
    },
    {
      key: 'fountain',
      name: withPrefix(prefix, 'Splash Pad 3000'),
      type: 'water_fountain',
      provider: 'esphome',
      external_id: 'demo-fountain-1',
      config: { host: 'fountain.local', port: 6053 },
    },
    {
      key: 'feeder',
      name: withPrefix(prefix, 'Biscuit Dispenser Mk. VII'),
      type: 'feeder',
      provider: 'esphome',
      external_id: 'demo-feeder-1',
      config: {
        food_compartments: [
          { compartment: '0', food_id: null },
          { compartment: '1', food_id: null },
        ],
      },
    },
  ];

  const visits = buildVisits(options.days);
  const meals = buildMeals(options.days);
  const fountainSips = buildFountainSips(options.days, meals);

  const weightCheckIns: SeedScenario['weightCheckIns'] = [];
  for (let dayIndex = 0; dayIndex < options.days; dayIndex++) {
    weightCheckIns.push({
      petKey: 'healthy',
      dayIndex,
      hour: 7,
      weightGrams: healthyWeightGramsForDay(dayIndex),
    });
    weightCheckIns.push({
      petKey: 'uti',
      dayIndex,
      hour: 7,
      weightGrams: utiWeightGramsForDay(dayIndex, options.days),
    });
  }

  const scoops = Array.from({ length: options.days }, (_, dayIndex) => ({
    dayIndex,
    hour: 8,
  }));

  return {
    foods: FOODS,
    pets,
    devices,
    dayStarts,
    visits,
    meals,
    fountainSips,
    weightCheckIns,
    scoops,
    seedNow,
  };
}

const PAST_BUFFER_MS = 60_000;

/** Scheduled slot on a calendar day, clamped to strictly before `notAfter`. */
export function eventTimestamp(
  dayStart: Date,
  hour: number,
  minute: number,
  notAfter: Date,
  sequence: number,
): Date {
  const scheduled = timestampForDaySlot(dayStart, hour, minute);
  const ceiling = new Date(
    notAfter.getTime() - PAST_BUFFER_MS - sequence * 2_000,
  );
  if (scheduled <= ceiling) {
    return scheduled;
  }
  return ceiling;
}

export function timestampForDaySlot(
  dayStart: Date,
  hour: number,
  minute: number,
): Date {
  return setSeconds(setMinutes(setHours(dayStart, hour), minute), 0);
}

export function catWeightForVisit(
  petKey: 'uti' | 'healthy',
  dayIndex: number,
  totalDays: number,
): number {
  return petKey === 'healthy'
    ? healthyWeightGramsForDay(dayIndex)
    : utiWeightGramsForDay(dayIndex, totalDays);
}

export { DEFAULT_SEED_DAYS };
