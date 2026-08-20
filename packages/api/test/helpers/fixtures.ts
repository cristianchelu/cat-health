import type { Kysely } from 'kysely';

import type { EventAttributionSourceDTO, EventCauseDTO } from 'shared';

import type { Database } from '../../src/database/index.ts';
import type { Event } from '../../src/database/types/EventTable.ts';
import { attributionColumns } from '../../src/domain/eventAttribution.ts';
import type {
  EventData,
  FoodIntakeEventData,
  LitterboxUseEventData,
  PetPresenceEventData,
  WaterIntakeEventData,
} from '../../src/domain/events.ts';
import type { NewPet, Pet } from '../../src/database/types/PetTable.ts';
import type {
  NewProviderAccount,
  ProviderAccount,
} from '../../src/database/types/ProviderAccountTable.ts';
import type {
  Device,
  NewDevice,
} from '../../src/database/types/DeviceTable.ts';
import type { Food, NewFood } from '../../src/database/types/FoodTable.ts';

type PetSeed = Partial<Pick<NewPet, 'name' | 'breed' | 'birth_date'>>;

type ProviderAccountSeed = Partial<
  Pick<
    NewProviderAccount,
    'provider' | 'name' | 'config' | 'runtime_state' | 'enabled' | 'internal'
  >
>;

type LitterboxEventSeed = {
  /** `null` seeds an unresolved visit — the device saw a use, nobody claimed it. */
  pet_id: number | null;
  /** Defaults to `pet` when `pet_id` is set, otherwise the unresolved `unknown`. */
  caused_by?: EventCauseDTO;
  attributed_by?: EventAttributionSourceDTO;
  device_id?: number | null;
  timestamp?: Date;
  human_verified?: boolean;
  raw_data?: Buffer | null;
} & Partial<
  Pick<
    LitterboxUseEventData,
    'elimination_type' | 'elimination_weight' | 'duration'
  >
>;

type WaterIntakeEventSeed = {
  pet_id: number;
  attributed_by?: EventAttributionSourceDTO;
  device_id?: number | null;
  timestamp?: Date;
} & Pick<WaterIntakeEventData, 'amount'>;

type FoodIntakeEventSeed = {
  pet_id: number;
  attributed_by?: EventAttributionSourceDTO;
  device_id?: number | null;
  timestamp?: Date;
  human_verified?: boolean;
} & Pick<FoodIntakeEventData, 'amount' | 'food_type' | 'food_id' | 'nutrients'>;

type WeightMeasurementEventSeed = {
  pet_id: number;
  attributed_by?: EventAttributionSourceDTO;
  device_id?: number | null;
  parent_event_id?: number | null;
  timestamp?: Date;
  weight: number;
};

type PetPresenceEventSeed = {
  pet_id: number;
  attributed_by?: EventAttributionSourceDTO;
  timestamp?: Date;
  human_verified?: boolean;
} & Pick<PetPresenceEventData, 'state' | 'previous_state' | 'context'>;

type DeviceSeed = Partial<
  Pick<NewDevice, 'name' | 'type' | 'external_id' | 'config' | 'enabled'>
> & {
  provider_account_id: number;
};

type FoodSeed = Partial<
  Pick<
    NewFood,
    | 'name'
    | 'brand'
    | 'food_type'
    | 'moisture_percent'
    | 'calories_per_100g'
    | 'nutrients'
  >
>;

export async function insertPet(
  db: Kysely<Database>,
  seed: PetSeed = {},
): Promise<Pet> {
  return db
    .insertInto('pet')
    .values({
      name: seed.name ?? 'Mochi',
      breed: seed.breed ?? 'Domestic Shorthair',
      birth_date: seed.birth_date ?? new Date('2020-01-01'),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function insertProviderAccount(
  db: Kysely<Database>,
  seed: ProviderAccountSeed = {},
): Promise<ProviderAccount> {
  // Milliseconds — `provider_account.created_at` / `updated_at` are epoch ms.
  const now = Date.now();
  return db
    .insertInto('provider_account')
    .values({
      provider: seed.provider ?? 'esphome',
      name: seed.name ?? 'Test account',
      config: seed.config ?? {},
      runtime_state: seed.runtime_state ?? {},
      enabled: seed.enabled ?? 1,
      internal: seed.internal ?? 0,
      created_at: now,
      updated_at: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function insertLitterboxEvent(
  db: Kysely<Database>,
  seed: LitterboxEventSeed,
): Promise<Event> {
  const data: LitterboxUseEventData = {
    type: 'litterbox_use',
    elimination_type: seed.elimination_type ?? 'urination',
    elimination_weight: seed.elimination_weight ?? 30,
    duration: seed.duration ?? 60,
  };

  return db
    .insertInto('event')
    .values({
      ...attributionColumns(
        seed.caused_by ?? (seed.pet_id != null ? 'pet' : 'unknown'),
        seed.pet_id,
        seed.attributed_by ?? null,
      ),
      device_id: seed.device_id ?? null,
      parent_event_id: null,
      timestamp: seed.timestamp ?? new Date(),
      data: data satisfies EventData,
      raw_data: seed.raw_data ?? null,
      human_verified: seed.human_verified ?? false,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function insertWaterIntakeEvent(
  db: Kysely<Database>,
  seed: WaterIntakeEventSeed,
): Promise<Event> {
  const data: WaterIntakeEventData = {
    type: 'water_intake',
    amount: seed.amount,
  };

  return db
    .insertInto('event')
    .values({
      ...attributionColumns('pet', seed.pet_id, seed.attributed_by ?? null),
      device_id: seed.device_id ?? null,
      parent_event_id: null,
      timestamp: seed.timestamp ?? new Date(),
      data: data satisfies EventData,
      raw_data: null,
      human_verified: false,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function insertDevice(
  db: Kysely<Database>,
  seed: DeviceSeed,
): Promise<Device> {
  const now = Date.now();
  return db
    .insertInto('device')
    .values({
      provider_account_id: seed.provider_account_id,
      external_id: seed.external_id ?? 'device-ext-1',
      name: seed.name ?? 'Test device',
      type: seed.type ?? 'litterbox',
      config: seed.config ?? { host: '192.168.1.50' },
      enabled: seed.enabled ?? 1,
      created_at: now,
      updated_at: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function insertFood(
  db: Kysely<Database>,
  seed: FoodSeed = {},
): Promise<Food> {
  const now = Math.floor(Date.now() / 1000);
  return db
    .insertInto('food')
    .values({
      name: seed.name ?? 'Test kibble',
      brand: seed.brand ?? null,
      food_type: seed.food_type ?? 'complete_dry',
      barcode_ean13: null,
      moisture_percent: seed.moisture_percent ?? 10,
      calories_per_100g: seed.calories_per_100g ?? 380,
      nutrients: seed.nutrients ?? null,
      serving_size_g: null,
      notes: null,
      created_at: now,
      updated_at: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function insertFoodIntakeEvent(
  db: Kysely<Database>,
  seed: FoodIntakeEventSeed,
): Promise<Event> {
  const data: FoodIntakeEventData = {
    type: 'food_intake',
    food_type: seed.food_type ?? 'wet',
    amount: seed.amount,
    ...(seed.food_id !== undefined ? { food_id: seed.food_id } : {}),
    ...(seed.nutrients !== undefined ? { nutrients: seed.nutrients } : {}),
  };

  return db
    .insertInto('event')
    .values({
      ...attributionColumns('pet', seed.pet_id, seed.attributed_by ?? null),
      device_id: seed.device_id ?? null,
      parent_event_id: null,
      timestamp: seed.timestamp ?? new Date(),
      data: data satisfies EventData,
      raw_data: null,
      human_verified: seed.human_verified ?? false,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function insertWeightMeasurementEvent(
  db: Kysely<Database>,
  seed: WeightMeasurementEventSeed,
): Promise<Event> {
  return db
    .insertInto('event')
    .values({
      ...attributionColumns('pet', seed.pet_id, seed.attributed_by ?? null),
      device_id: seed.device_id ?? null,
      parent_event_id: seed.parent_event_id ?? null,
      timestamp: seed.timestamp ?? new Date(),
      data: {
        type: 'weight_measurement',
        weight: seed.weight,
      } satisfies EventData,
      raw_data: null,
      human_verified: false,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function insertPetPresenceEvent(
  db: Kysely<Database>,
  seed: PetPresenceEventSeed,
): Promise<Event> {
  const data: PetPresenceEventData = {
    type: 'pet_presence',
    state: seed.state,
    previous_state: seed.previous_state,
    ...(seed.context !== undefined ? { context: seed.context } : {}),
  };

  return db
    .insertInto('event')
    .values({
      ...attributionColumns('pet', seed.pet_id, seed.attributed_by ?? null),
      device_id: null,
      parent_event_id: null,
      timestamp: seed.timestamp ?? new Date(),
      data: data satisfies EventData,
      raw_data: null,
      human_verified: seed.human_verified ?? true,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}
