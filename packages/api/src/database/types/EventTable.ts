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
  source?: 'drinking' | 'food';
}

export interface LitterboxUseEventData {
  type: 'litterbox_use';
  elimination_type: LitterboxUseEliminationType;
  elimination_weight: number;
  duration: number;
  straining?: boolean;
}

export type FoodIntakeFoodType = 'dry' | 'wet' | 'treat' | 'unknown';
export interface FoodIntakeEventData {
  type: 'food_intake';
  food_type: FoodIntakeFoodType;
  amount: number;
  food_id?: number;
  nutrients?: {
    calories?: number;
    moisture_ml?: number;
    protein_g?: number;
    fat_g?: number;
    fiber_g?: number;
    ash_g?: number;
    carbs_g?: number;
    calcium_mg?: number;
    phosphorus_mg?: number;
    taurine_mg?: number;
    sodium_mg?: number;
    omega3_g?: number;
    omega6_g?: number;
    [key: string]: number | undefined;
  };
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
