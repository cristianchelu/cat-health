import type { Kysely } from 'kysely';
import type { Database } from '../../database/index.ts';
import type { NewEvent } from '../../database/types/EventTable.ts';
import type { EventData } from '../../domain/events.ts';
import type { EventBus } from '../devices/EventBus.ts';

export interface RecordDeviceEventDeps {
  db: Kysely<Database>;
  eventBus: EventBus;
}

export interface RecordDeviceEventInput {
  deviceId: number;
  data: EventData;
  timestamp?: Date;
  pet_id?: number | null;
  raw_data?: Buffer | null;
  human_verified?: boolean;
}

export async function recordDeviceEvent(
  deps: RecordDeviceEventDeps,
  input: RecordDeviceEventInput,
): Promise<number> {
  const timestamp = input.timestamp ?? new Date();

  const event: NewEvent = {
    pet_id: input.pet_id ?? null,
    device_id: input.deviceId,
    timestamp,
    data: input.data,
    raw_data: input.raw_data ?? null,
    human_verified: input.human_verified ?? false,
  };

  const inserted = await deps.db
    .insertInto('event')
    .values(event)
    .returning(['id'])
    .executeTakeFirstOrThrow();

  deps.eventBus.publish('device.event', {
    deviceId: input.deviceId,
    eventId: inserted.id,
    type: input.data.type,
    data: input.data,
    timestamp,
  });

  return inserted.id;
}
