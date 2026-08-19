import type {
  LitterboxAnalysisStatePeriod,
  LitterboxUseEliminationType,
  EventProviderData,
} from 'shared';

/**
 * Domain model for event payloads — the shapes business logic works with.
 *
 * Adapters translate to and from this model at the edges:
 * - `database/types/storedEventData.ts` parses the persisted JSON column into it
 * - `routes/mappers/events.ts` maps it to/from the wire DTOs in `shared`
 */

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
  /**
   * True samples-per-second of this visit's raw_data weight trace; converts
   * `segments` sample indices to seconds. Derived from v2 per-sample offsets
   * (or count/duration for v1); absent on rows predating the backfill.
   */
  sample_rate_hz?: number;
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
  /**
   * Computed nutrient totals for the intake, keyed by nutrient. Known keys:
   * `calories`, `moisture_ml`, `protein_g`, `fat_g`, `fiber_g`, `ash_g`,
   * `carbs_g`, `calcium_mg`, `phosphorus_mg`, `taurine_mg`, `sodium_mg`,
   * `omega3_g`, `omega6_g`.
   */
  nutrients?: Record<string, number>;
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
