import type { Kysely } from 'kysely';

import type { Database } from '../../src/database/index.ts';
import type {
  Event,
  EventData,
  LitterboxUseEventData,
  WaterIntakeEventData,
} from '../../src/database/types/EventTable.ts';
import type { NewPet, Pet } from '../../src/database/types/PetTable.ts';
import type {
  NewProviderAccount,
  ProviderAccount,
} from '../../src/database/types/ProviderAccountTable.ts';

type PetSeed = Partial<Pick<NewPet, 'name' | 'breed' | 'birth_date'>>;

type ProviderAccountSeed = Partial<
  Pick<
    NewProviderAccount,
    'provider' | 'name' | 'config' | 'enabled' | 'internal'
  >
>;

type LitterboxEventSeed = {
  pet_id: number;
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
  device_id?: number | null;
  timestamp?: Date;
} & Pick<WaterIntakeEventData, 'amount'>;

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
  const now = Math.floor(Date.now() / 1000);
  return db
    .insertInto('provider_account')
    .values({
      provider: seed.provider ?? 'esphome',
      name: seed.name ?? 'Test account',
      config: seed.config ?? {},
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
      pet_id: seed.pet_id,
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
      pet_id: seed.pet_id,
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
