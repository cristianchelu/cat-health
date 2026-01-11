import type { Generated, Insertable, Selectable, Updateable } from 'kysely';
import { LitterboxUseEliminationType } from 'shared';

export interface WeightMeasurementEventData {
  type: 'weight_measurement';
  weight: number;
}

export interface WaterIntakeEventData {
  type: 'water_intake';
  amount: number;
  duration?: number;
}

export interface LitterboxUseEventData {
  type: 'litterbox_use';
  elimination_type: LitterboxUseEliminationType;
  elimination_weight: number;
  duration: number;
}

export type FoodIntakeFoodType = 'dry' | 'wet' | 'treat' | 'unknown';
export interface FoodIntakeEventData {
  type: 'food_intake';
  food_type: FoodIntakeFoodType;
  amount: number;
}

export type LitterboxMaintenanceEventType =
  | 'scoop'
  | 'deep_clean'
  | 'litter_change'
  | 'litter_addition';
export interface LitterboxMaintenanceEventData {
  type: 'litterbox_maintenance';
  maintenance_type: LitterboxMaintenanceEventType;
  litter_amount?: number; // in grams, for litter_change/litter_addition
}

export type EventData =
  | WeightMeasurementEventData
  | WaterIntakeEventData
  | LitterboxUseEventData
  | FoodIntakeEventData
  | LitterboxMaintenanceEventData;

export type EventTable<TData = EventData> = {
  id: Generated<number>;
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
