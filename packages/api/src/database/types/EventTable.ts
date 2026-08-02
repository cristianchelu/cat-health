import type { Generated, Insertable, Selectable, Updateable } from 'kysely';
import type { EventAttributionSourceDTO, EventCauseDTO } from 'shared';
import type { EventData } from '../../domain/events.ts';

export type EventTable<TData = EventData> = {
  id: Generated<number>;
  parent_event_id: number | null;
  // TODO: Migrate type to root once kysely gets discriminated union support
  //       https://github.com/kysely-org/kysely/issues/577
  // type: string;
  pet_id: number | null;
  /**
   * What caused the event: `unknown` until something decides, `pet` when an
   * animal of ours did it (with `pet_id` naming which, or null when we know it
   * was a pet but not which), or a non-pet cause. A DB CHECK allows a `pet_id`
   * only alongside `pet`.
   *
   * `Generated` because the column defaults to `'unknown'` — insert sites with
   * no opinion simply omit it.
   */
  caused_by: Generated<EventCauseDTO>;
  /** How the cause was established; null while nothing has decided. */
  attributed_by: EventAttributionSourceDTO | null;
  device_id: number | null;
  timestamp: Date;
  data: TData;
  raw_data: Buffer | null;
  human_verified: boolean;
};

export type Event<TData = EventData> = Selectable<EventTable<TData>>;
export type NewEvent<TData = EventData> = Insertable<EventTable<TData>>;
export type EventUpdate<TData = EventData> = Updateable<EventTable<TData>>;
