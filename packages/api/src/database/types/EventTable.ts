import type { Generated, Insertable, Selectable, Updateable } from 'kysely';
import type {
  LitterboxAnalysisStatePeriod,
  LitterboxUseEliminationType,
  EventProviderData,
} from 'shared';

export interface WeightMeasurementEventData {
  type: 'weight_measurement';
  weight: number;
}

export interface WaterIntakeEventData {
  type: 'water_intake';
  amount: number;
  duration?: number;
  source?: 'drinking' | 'food';
  raw_amount?: number; // total weight drop before rate filtering (ml)
  excluded_amount?: number; // amount removed by rate filter (spill/play, ml)
  filtered?: boolean; // true when any segments were excluded
}

export interface LitterboxBoutAnnotation {
  bout_index: number;
  t_start_s: number;
  t_end_s: number;
  bout_type: 'urination' | 'defecation' | 'unknown';
}

export interface LitterboxAnnotation {
  bouts: LitterboxBoutAnnotation[];
  /** When true, omit from human-verified export / training fixtures (bad data). */
  excluded?: boolean;
}

export interface LitterboxUseEventData {
  type: 'litterbox_use';
  elimination_type: LitterboxUseEliminationType;
  elimination_weight: number;
  duration: number;
  straining?: boolean;
  annotation?: LitterboxAnnotation;
  /**
   * Full server `StateAnalyzer` period list (sample indices). `null` = not analyzed / cleared;
   * `[]` = analyzed, zero periods. Per-row `elimination_type` (urination/defecation) is set on ingest/analyze.
   */
  segments?: LitterboxAnalysisStatePeriod[] | null;
}

export type FoodIntakeFoodType = 'dry' | 'wet' | 'treat' | 'unknown';

export interface FoodIntakeEventData {
  type: 'food_intake';
  food_type: FoodIntakeFoodType;
  amount: number;
  food_id?: number;
  provider_data?: EventProviderData;
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

export type DeviceConnectivityState = 'online' | 'offline' | 'error';
export type DeviceConnectivityPreviousState =
  | DeviceConnectivityState
  | 'unknown';

export interface DeviceConnectivityEventData {
  type: 'device_connectivity';
  state: DeviceConnectivityState;
  previous_state?: DeviceConnectivityPreviousState;
}

export type PetPresenceState = 'away' | 'home' | 'outside';
export type PetPresenceContext = 'vet' | 'travel' | 'friend' | 'manual';
export type PetPresencePreviousState = PetPresenceState | 'unknown';

export interface PetPresenceEventData {
  type: 'pet_presence';
  state: PetPresenceState;
  context?: PetPresenceContext;
  previous_state?: PetPresencePreviousState;
}

export type EventData =
  | WeightMeasurementEventData
  | WaterIntakeEventData
  | LitterboxUseEventData
  | FoodIntakeEventData
  | LitterboxMaintenanceEventData
  | DeviceConnectivityEventData
  | PetPresenceEventData;

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
