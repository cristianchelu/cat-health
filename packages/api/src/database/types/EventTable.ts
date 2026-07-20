import type { Generated, Insertable, Selectable, Updateable } from 'kysely';
import type { EventData } from '../../domain/events.ts';

export type EventTable<TData = EventData> = {
  id: Generated<number>;
  parent_event_id: number | null;
  // TODO: Migrate type to root once kysely gets discriminated union support
  //       https://github.com/kysely-org/kysely/issues/577
  // type: string;
  pet_id: number | null;
  device_id: number | null;
  timestamp: Date;
  data: TData;
  raw_data: Buffer | null;
  human_verified: boolean;
};

export type Event<TData = EventData> = Selectable<EventTable<TData>>;
export type NewEvent<TData = EventData> = Insertable<EventTable<TData>>;
export type EventUpdate<TData = EventData> = Updateable<EventTable<TData>>;
