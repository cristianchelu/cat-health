import type { Kysely } from 'kysely';

import type { Database } from '../../src/database/index.ts';
import type { Event, EventData } from '../../src/database/types/EventTable.ts';
import type { Pet } from '../../src/database/types/PetTable.ts';

export interface InsertPetOptions {
  name?: string;
  breed?: string;
  birth_date?: Date;
}

export async function insertPet(
  db: Kysely<Database>,
  options: InsertPetOptions = {},
): Promise<Pet> {
  return db
    .insertInto('pet')
    .values({
      name: options.name ?? 'Mochi',
      breed: options.breed ?? 'Domestic Shorthair',
      birth_date: options.birth_date ?? new Date('2020-01-01'),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export interface InsertLitterboxEventOptions {
  pet_id: number;
  device_id?: number | null;
  timestamp?: Date;
  elimination_type?:
    | 'urination'
    | 'defecation'
    | 'both'
    | 'no_elimination'
    | 'unknown';
  elimination_weight?: number;
  duration?: number;
  raw_data?: Buffer | null;
  human_verified?: boolean;
}

export async function insertLitterboxEvent(
  db: Kysely<Database>,
  options: InsertLitterboxEventOptions,
): Promise<Event> {
  const data = {
    type: 'litterbox_use' as const,
    elimination_type: options.elimination_type ?? 'urination',
    elimination_weight: options.elimination_weight ?? 30,
    duration: options.duration ?? 60,
  };

  return db
    .insertInto('event')
    .values({
      pet_id: options.pet_id,
      device_id: options.device_id ?? null,
      parent_event_id: null,
      timestamp: options.timestamp ?? new Date(),
      data: data satisfies EventData,
      raw_data: options.raw_data ?? null,
      human_verified: options.human_verified ?? false,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}
