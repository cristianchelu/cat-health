import type { Kysely } from 'kysely';
import type { Database } from '../../database/index.ts';
import type { NewEvent } from '../../database/types/EventTable.ts';
import type { EventData } from '../../domain/events.ts';
import type { EventBus } from '../devices/EventBus.ts';
import type { EventAttributionSourceDTO } from 'shared';
import { attributionColumns } from '../../domain/eventAttribution.ts';

export interface RecordDeviceEventDeps {
  db: Kysely<Database>;
  eventBus: EventBus;
}

export interface RecordDeviceEventInput {
  deviceId: number;
  data: EventData;
  timestamp?: Date;
  pet_id?: number | null;
  /**
   * How this device knows which pet. Required alongside a `pet_id` so a caller
   * cannot claim an identification without saying what it rests on; leave both
   * unset for the unresolved events most device paths produce.
   */
  attributed_by?: EventAttributionSourceDTO;
  raw_data?: Buffer | null;
  human_verified?: boolean;
}

export async function recordDeviceEvent(
  deps: RecordDeviceEventDeps,
  input: RecordDeviceEventInput,
): Promise<number> {
  const timestamp = input.timestamp ?? new Date();

  const event: NewEvent = {
    ...attributionColumns(
      input.pet_id != null ? 'pet' : 'unknown',
      input.pet_id ?? null,
      input.pet_id != null ? (input.attributed_by ?? null) : null,
    ),
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
