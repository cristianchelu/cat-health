import type { EventDataDTO } from 'shared';

import type { EventData } from '../../domain/events.ts';

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
