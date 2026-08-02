import type {
  EventAttributionSourceDTO,
  EventCauseDTO,
  EventDataDTO,
  GetEventDTO,
} from 'shared';

import type { EventData } from '../../domain/events.ts';
import { parseStoredEventData } from '../../database/types/storedEventData.ts';

/**
 * Domain ↔ wire mapping for the event `data` payload.
 *
 * Identity functions today — deliberately cast-free, so they compile only
 * while the domain and DTO shapes stay mutually assignable. The day one of
 * them errors, the shapes have diverged: replace the identity for the
 * diverged variant with an explicit per-variant mapper (built as an object
 * literal, so excess-property checks flag field drift).
 */

export function eventDataToDto(data: EventData): EventDataDTO {
  return data;
}

export function eventDataFromDto(data: EventDataDTO): EventData {
  return data;
}

interface EventRow {
  id: number;
  parent_event_id: number | null;
  pet_id: number | null;
  caused_by: EventCauseDTO;
  attributed_by: EventAttributionSourceDTO | null;
  device_id: number | null;
  timestamp: Date;
  data: unknown;
  raw_data: Buffer | null;
  human_verified: boolean;
}

/** DB row → wire DTO; `null` when the stored `data` blob fails the storage contract. */
export function serializeEventRow(row: EventRow): GetEventDTO | null {
  const data = parseStoredEventData(row.data);
  if (!data) return null;

  return {
    id: row.id,
    parent_event_id: row.parent_event_id,
    pet_id: row.pet_id,
    caused_by: row.caused_by,
    attributed_by: row.attributed_by,
    device_id: row.device_id,
    timestamp: row.timestamp.toISOString(),
    data: eventDataToDto(data),
    raw_data: row.raw_data ? Array.from(row.raw_data) : null,
    human_verified: row.human_verified,
  };
}

/** For rows the server just wrote or that must exist intact — corrupt data is a 500, not a skip. */
export function requireSerializedEventRow(row: EventRow): GetEventDTO {
  const serialized = serializeEventRow(row);
  if (!serialized) {
    throw new Error(`Invalid event data for event ${row.id}`);
  }
  return serialized;
}
