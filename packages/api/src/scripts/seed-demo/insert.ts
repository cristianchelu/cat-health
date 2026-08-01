import type { Kysely } from 'kysely';

import type { Database } from '../../database/index.ts';
import type { Food } from '../../database/types/FoodTable.ts';
import {
  buildMoistureChildEventValues,
  enrichFoodIntakeEventData,
} from '../../services/food/enrichFoodIntake.ts';
import { generateDemoVisit } from './generateVisit.ts';
import {
  buildSeedScenario,
  catWeightForVisit,
  eventTimestamp,
  type SeedScenario,
} from './scenario.ts';
import { HEALTHY_WEIGHT_GRAMS } from './metrics.ts';
import { seedPetAvatars } from './avatars.ts';

export interface SeedResult {
  pets: Array<{ key: string; id: number; name: string }>;
  devices: Array<{ key: string; id: number; name: string }>;
  foods: Array<{ key: string; id: number; name: string }>;
  eventCounts: Record<string, number>;
  avatarCount: number;
  dateRange: { start: string; end: string };
}

async function resolveProviderAccountId(
  db: Kysely<Database>,
  provider: 'esphome',
): Promise<number> {
  const row = await db
    .selectFrom('provider_account')
    .select('id')
    .where('provider', '=', provider)
    .executeTakeFirstOrThrow();
  return row.id;
}

async function insertFoods(
  db: Kysely<Database>,
  scenario: SeedScenario,
): Promise<Map<string, Food>> {
  const now = Math.floor(Date.now() / 1000);
  const byKey = new Map<string, Food>();

  for (const food of scenario.foods) {
    const inserted = await db
      .insertInto('food')
      .values({
        name: food.name,
        brand: food.brand,
        food_type: food.food_type,
        barcode_ean13: null,
        moisture_percent: food.moisture_percent,
        calories_per_100g: food.calories_per_100g,
        nutrients: null,
        serving_size_g: null,
        notes: null,
        created_at: now,
        updated_at: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    byKey.set(food.key, inserted);
  }

  return byKey;
}

async function insertPets(
  db: Kysely<Database>,
  scenario: SeedScenario,
): Promise<Map<string, number>> {
  const byKey = new Map<string, number>();
  for (const pet of scenario.pets) {
    const inserted = await db
      .insertInto('pet')
      .values({
        name: pet.name,
        breed: pet.breed,
        birth_date: new Date(`${pet.birth_date}T00:00:00`),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    byKey.set(pet.key, inserted.id);
  }
  return byKey;
}

async function insertDevices(
  db: Kysely<Database>,
  scenario: SeedScenario,
  foodsByKey: Map<string, Food>,
): Promise<Map<string, number>> {
  const byKey = new Map<string, number>();

  for (const device of scenario.devices) {
    const providerAccountId = await resolveProviderAccountId(
      db,
      device.provider,
    );

    let config = device.config;
    if (device.key === 'feeder') {
      const salmon = foodsByKey.get('salmon_yowlentine');
      const kibble = foodsByKey.get('toebeans_kibble');
      config = {
        food_compartments: [
          { compartment: '0', food_id: salmon?.id ?? null },
          { compartment: '1', food_id: kibble?.id ?? null },
        ],
      };
    }

    const inserted = await db
      .insertInto('device')
      .values({
        provider_account_id: providerAccountId,
        external_id: device.external_id,
        name: device.name,
        type: device.type,
        config,
        enabled: 1,
        last_seen: null,
        status: 'offline',
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    byKey.set(device.key, inserted.id);
  }

  return byKey;
}

export async function runSeedDemo(
  db: Kysely<Database>,
  options: { days: number; prefix: string },
): Promise<SeedResult> {
  const scenario = buildSeedScenario(options);
  const foodsByKey = await insertFoods(db, scenario);
  const petIds = await insertPets(db, scenario);
  const avatarCount = await seedPetAvatars(
    db,
    petIds as Map<'uti' | 'healthy', number>,
  );
  const deviceIds = await insertDevices(db, scenario, foodsByKey);

  const litterboxId = deviceIds.get('litterbox')!;
  const fountainId = deviceIds.get('fountain')!;
  const feederId = deviceIds.get('feeder')!;

  const eventCounts: Record<string, number> = {
    weight_measurement: 0,
    litterbox_use: 0,
    litterbox_maintenance: 0,
    food_intake: 0,
    water_intake: 0,
  };

  const knownCatWeights = [4000, HEALTHY_WEIGHT_GRAMS];
  const { seedNow } = scenario;
  let eventSeq = 0;
  const ts = (dayStart: Date, hour: number, minute: number) =>
    eventTimestamp(dayStart, hour, minute, seedNow, eventSeq++);

  // Baseline weights before any litterbox visits (day 0 morning).
  const baselineDay = scenario.dayStarts[0];
  for (const checkIn of scenario.weightCheckIns.filter(
    (w) => w.dayIndex === 0,
  )) {
    const petId = petIds.get(checkIn.petKey)!;
    await db
      .insertInto('event')
      .values({
        pet_id: petId,
        device_id: litterboxId,
        timestamp: ts(baselineDay, checkIn.hour, 0),
        data: { type: 'weight_measurement', weight: checkIn.weightGrams },
        raw_data: null,
        human_verified: false,
      })
      .execute();
    eventCounts.weight_measurement += 1;
  }

  for (const visit of scenario.visits) {
    const petId = petIds.get(visit.petKey)!;
    const dayStart = scenario.dayStarts[visit.dayIndex];
    const timestamp = ts(dayStart, visit.hour, visit.minute);
    const catWeight = catWeightForVisit(
      visit.petKey,
      visit.dayIndex,
      options.days,
    );

    const generated = generateDemoVisit(timestamp, {
      eliminationType: visit.eliminationType,
      catWeightGrams: catWeight,
      eliminationWeightGrams: visit.eliminationWeightGrams,
      eliminationActiveSeconds: visit.eliminationActiveSeconds,
      straining: visit.straining,
      knownCatWeightsGrams: knownCatWeights,
    });

    const inserted = await db
      .insertInto('event')
      .values({
        pet_id: petId,
        device_id: litterboxId,
        timestamp,
        data: generated.data,
        raw_data: generated.rawData,
        human_verified: false,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    eventCounts.litterbox_use += 1;

    await db
      .insertInto('event')
      .values({
        parent_event_id: inserted.id,
        pet_id: petId,
        device_id: litterboxId,
        timestamp,
        data: {
          type: 'weight_measurement',
          weight: generated.detectedCatWeightGrams,
        },
        raw_data: null,
        human_verified: false,
      })
      .execute();
    eventCounts.weight_measurement += 1;
  }

  // Daily weigh-ins after day 0.
  for (const checkIn of scenario.weightCheckIns.filter((w) => w.dayIndex > 0)) {
    const petId = petIds.get(checkIn.petKey)!;
    const dayStart = scenario.dayStarts[checkIn.dayIndex];
    await db
      .insertInto('event')
      .values({
        pet_id: petId,
        device_id: litterboxId,
        timestamp: ts(dayStart, checkIn.hour, 0),
        data: { type: 'weight_measurement', weight: checkIn.weightGrams },
        raw_data: null,
        human_verified: false,
      })
      .execute();
    eventCounts.weight_measurement += 1;
  }

  for (const scoop of scenario.scoops) {
    const dayStart = scenario.dayStarts[scoop.dayIndex];
    await db
      .insertInto('event')
      .values({
        pet_id: null,
        device_id: litterboxId,
        timestamp: ts(dayStart, scoop.hour, 0),
        data: { type: 'litterbox_maintenance', maintenance_type: 'scoop' },
        raw_data: null,
        human_verified: false,
      })
      .execute();
    eventCounts.litterbox_maintenance += 1;
  }

  for (const meal of scenario.meals) {
    const petId = petIds.get(meal.petKey)!;
    const food = foodsByKey.get(meal.foodKey)!;
    const dayStart = scenario.dayStarts[meal.dayIndex];
    const timestamp = ts(dayStart, meal.hour, meal.minute);

    const foodData = enrichFoodIntakeEventData(
      {
        type: 'food_intake',
        food_type: 'unknown',
        amount: meal.amountGrams,
        food_id: food.id,
      },
      food,
    );

    const inserted = await db
      .insertInto('event')
      .values({
        pet_id: petId,
        device_id: feederId,
        timestamp,
        data: foodData,
        raw_data: null,
        human_verified: true,
      })
      .returning(['id', 'pet_id', 'timestamp', 'data'])
      .executeTakeFirstOrThrow();

    eventCounts.food_intake += 1;

    const moistureMl = foodData.nutrients?.moisture_ml;
    if (moistureMl != null && moistureMl > 0) {
      await db
        .insertInto('event')
        .values(
          buildMoistureChildEventValues({
            parentEventId: inserted.id,
            petId: inserted.pet_id,
            timestamp: inserted.timestamp,
            moistureMl,
          }),
        )
        .execute();
      eventCounts.water_intake += 1;
    }
  }

  for (const sip of scenario.fountainSips) {
    const petId = petIds.get(sip.petKey)!;
    const dayStart = scenario.dayStarts[sip.dayIndex];
    await db
      .insertInto('event')
      .values({
        pet_id: petId,
        device_id: fountainId,
        timestamp: ts(dayStart, sip.hour, sip.minute),
        data: {
          type: 'water_intake',
          amount: sip.amountMl,
          duration: sip.durationSeconds,
          source: 'drinking',
        },
        raw_data: null,
        human_verified: false,
      })
      .execute();
    eventCounts.water_intake += 1;
  }

  return {
    pets: scenario.pets.map((pet) => ({
      key: pet.key,
      id: petIds.get(pet.key)!,
      name: pet.name,
    })),
    devices: scenario.devices.map((device) => ({
      key: device.key,
      id: deviceIds.get(device.key)!,
      name: device.name,
    })),
    foods: scenario.foods.map((food) => ({
      key: food.key,
      id: foodsByKey.get(food.key)!.id,
      name: food.name,
    })),
    eventCounts,
    avatarCount,
    dateRange: {
      start: scenario.dayStarts[0].toISOString(),
      end: scenario.seedNow.toISOString(),
    },
  };
}
