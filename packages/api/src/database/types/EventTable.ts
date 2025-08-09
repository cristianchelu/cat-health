import type { Generated, Insertable, Selectable, Updateable } from "kysely";

export interface WeightMeasurementEventData {
  type: "weight_measurement";
  weight: number;
}

export interface WaterIntakeEventData {
  type: "water_intake";
  amount: number;
}

export interface LitterboxUseEventData {
  type: "litterbox_use";
  elimination_type: "urination" | "defecation" | "no_elimination" | "unknown";
  elimination_weight: number;
  duration: number;
}

export interface FoodIntakeEventData {
  type: "food_intake";
  food_type: "dry" | "wet" | "treat" | "unknown";
  amount: number;
}

export interface LitterboxMaintenanceEventData {
  type: "litterbox_maintenance";
  maintenance_type: "scoop" | "deep_clean" | "litter_change" | "litter_addition";
  litter_amount?: number; // in grams, for litter_change/litter_addition
}

export type EventTable = {
  id: Generated<number>;
  // TODO: Migrate type to root once kysely gets discriminated union support
  //       https://github.com/kysely-org/kysely/issues/577
  // type: string;
  pet_id: number | null;
  device_id: number | null;
  timestamp: Date;
  data:
    | WeightMeasurementEventData
    | WaterIntakeEventData
    | LitterboxUseEventData
    | FoodIntakeEventData
    | LitterboxMaintenanceEventData;
  raw_data: Buffer | null;
  human_verified: boolean;
};

export type Event = Selectable<EventTable>;
export type NewEvent = Insertable<EventTable>;
export type EventUpdate = Updateable<EventTable>;
