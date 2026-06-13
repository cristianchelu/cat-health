import type { Kysely } from 'kysely';
import type { Database } from '../../database/index.ts';
import type {
  NewEvent,
  PetPresenceEventData,
} from '../../database/types/EventTable.ts';

export interface RecordPetPresenceEventDeps {
  db: Kysely<Database>;
}

export interface RecordPetPresenceEventInput {
  petId: number;
  data: PetPresenceEventData;
  timestamp?: Date;
  human_verified?: boolean;
}

export async function recordPetPresenceEvent(
  deps: RecordPetPresenceEventDeps,
  input: RecordPetPresenceEventInput,
): Promise<number> {
  const timestamp = input.timestamp ?? new Date();

  const event: NewEvent<PetPresenceEventData> = {
    pet_id: input.petId,
    device_id: null,
    parent_event_id: null,
    timestamp,
    data: input.data,
    raw_data: null,
    human_verified: input.human_verified ?? true,
  };

  const inserted = await deps.db
    .insertInto('event')
    .values(event)
    .returning(['id'])
    .executeTakeFirstOrThrow();

  return inserted.id;
}
