/** Ported / inferred SurePetcare API response shapes. */

import type { EventCauseDTO } from 'shared';
import type { SubstanceTypeId, WeightContextId } from './constants.ts';

export interface SurePetApiListResponse<T> {
  data?: T[];
}

export interface SurePetApiObjectResponse<T> {
  data?: T;
}

export interface SurePetMeStartData {
  devices?: SurePetCloudDevice[];
  pets?: SurePetCloudPet[];
  households?: Array<{ id: number }>;
}

export interface SurePetCloudPet {
  id: number;
  name?: string | null;
  household_id?: number | null;
  tag_id?: number | null;
  tag?: { id: number } | null;
}

export interface SurePetCloudDevice {
  id: number;
  product_id: number;
  household_id?: number | null;
  name?: string | null;
  serial_number?: string | null;
  parent_device_id?: number | null;
  status?: SurePetDeviceStatusPayload;
  control?: SurePetDeviceControlPayload;
}

export interface SurePetDeviceSignal {
  device_rssi?: number | null;
}

export interface SurePetDeviceStatusPayload {
  battery?: number | null;
  signal?: SurePetDeviceSignal | null;
  bowl_status?: SurePetBowlStatusPayload[] | null;
  online?: boolean | null;
}

export interface SurePetDeviceControlPayload {
  lid?: { close_delay?: number | null } | null;
  training_mode?: number | null;
  bowls?: {
    type?: number | null;
    settings?: Array<{
      food_type?: number | null;
      target?: number | null;
    } | null> | null;
  } | null;
}

/**
 * A partial control document for `control/async`. Their app sends one
 * top-level key per request and always the whole sub-object under it.
 */
export type SurePetControlWrite = Pick<
  SurePetDeviceControlPayload,
  'lid' | 'bowls'
> & {
  /** `FeederTareType` on a feeder. */
  tare?: number;
};

/** One request as `control/async` returns it and `control/status` lists it. */
export interface SurePetControlRequest {
  request_id?: string | number | null;
  /** `ControlRequestStatus`; their app reads either field. */
  status_id?: number | null;
  status?: number | null;
}

export interface SurePetBowlStatusPayload {
  position?: number | null;
  current_weight?: number | null;
}

export interface SurePetTimelineWeightFrame {
  index?: number | null;
  change?: number | null;
  current_weight?: number | null;
}

export interface SurePetTimelineWeightRecord {
  id?: number;
  device_id?: number | null;
  tag_id?: number | null;
  duration?: number | null;
  created_at?: string | null;
  /** `WeightContext` — why this record exists. Absent on older rows. */
  context?: WeightContextId | number | null;
  frames?: SurePetTimelineWeightFrame[] | null;
}

/**
 * The `data` column of a timeline entry, which arrives as a JSON *string*
 * rather than an object and so has to be parsed before anything can be read
 * off it. Carries the per-bowl food types and targets in hardware bowl order.
 */
export interface SurePetTimelineEntryData {
  weight?: {
    /** `FoodType` per bowl index. */
    food_type?: Array<number | null> | null;
    /** Target grams per bowl index. */
    target?: Array<number | null> | null;
    tare_value?: number | null;
  } | null;
  /** `FeederTareType` on a `FEEDER_RESET` entry. */
  tare_type?: number | null;
}

export interface SurePetTimelinePetRef {
  id?: number;
  tag_id?: number | null;
}

export interface SurePetTimelineEntry {
  id?: number;
  type?: number | null;
  created_at?: string | null;
  /** JSON-encoded `SurePetTimelineEntryData`; parse, do not index. */
  data?: string | null;
  consumptions?: SurePetConsumptionRecord[] | null;
  feeding?: { datapoints?: SurePetFeedingDatapoint[] | null } | null;
  weights?: SurePetTimelineWeightRecord[] | null;
  pets?: SurePetTimelinePetRef[] | null;
}

export interface SurePetConsumptionRecord {
  id?: number;
  tag_id?: number | null;
  device_id?: number | null;
  substance_type?: SubstanceTypeId | null;
  change?: number[] | null;
  at?: string | null;
}

/**
 * One bowl's entry in a report datapoint.
 *
 * `weight` is the bowl LEVEL after the visit and `change` is what the animal
 * took — the two are not interchangeable and only `change` is an amount. A
 * 3 g nibble from a full bowl reports `weight: 59, change: -3`.
 */
export interface SurePetFeedingDatapointWeight {
  index?: number | null;
  /** Bowl level after the visit, in grams. NOT the amount consumed. */
  weight?: number | null;
  /** Grams consumed, negative. This is the amount. */
  change?: number | null;
  food_type_id?: number | null;
  target_weight?: number | null;
}

export interface SurePetFeedingDatapoint {
  from?: string | null;
  to?: string | null;
  duration?: number | null;
  /**
   * The feeder's current bowl reading, repeated verbatim on every datapoint in
   * the response — a property of the device now, not of this visit. Never an
   * amount; deliberately unread.
   */
  actual_weight?: number | null;
  /** `WeightContext`; report datapoints observed so far are all `PET_CLOSED`. */
  context?: WeightContextId | number | null;
  weights?: SurePetFeedingDatapointWeight[] | null;
  tag_id?: number | null;
  device_id?: number | null;
  bowl_count?: number | null;
  pet_id?: number | null;
}

export interface SurePetHouseholdReportPair {
  pet_id?: number;
  device_id?: number;
  feeding?: { datapoints?: SurePetFeedingDatapoint[] | null } | null;
}

/**
 * A serving: food going INTO a bowl rather than out of it.
 *
 * Kept apart from `NormalizedFeedingDatapoint` because the two carry different
 * facts — a serving has no pet and no duration worth keeping, and it does have
 * the bowl levels either side.
 */
export interface NormalizedServedDatapoint {
  from: Date;
  /** Grams added. Always positive. */
  amount_g: number;
  /** SurePet cloud device id */
  device_id?: number;
  /** SurePet hardware bowl index (0 | 1); not a compartment id. */
  bowl_index: number;
  /**
   * Bowl level in grams before and after this serving. Both absent together
   * when the frame carried no `current_weight` — a level we did not read is
   * not a level of zero, and inventing one would turn every unweighed serving
   * into a "fresh bowl".
   */
  level_before_g?: number;
  level_after_g?: number;
  /** `FoodType` for this bowl, read off the entry's own payload. */
  food_type_id?: number;
  timeline_entry_id?: number;
  source_id: string;
}

/** Normalized feeding event used internally before mapping to local events. */
export interface NormalizedFeedingDatapoint {
  from: Date;
  to?: Date;
  duration_s?: number;
  amount_g: number;
  tag_id?: number;
  /** SurePet cloud device id */
  device_id?: number;
  /** SurePet cloud pet id */
  pet_id?: number;
  timeline_entry_id?: number;
  source_id: string;
  /** SurePet hardware bowl index when consumption is per-bowl. */
  bowl_index?: number;
  /**
   * Who ate it, as far as the feeder is willing to say. `pet` is a chip read;
   * `other_animal` is the feeder reporting an intruder it did not recognise;
   * `unknown` is a reading it distrusts. Absent means the source predates
   * `context` and is assumed to be a recognised pet, as it always was.
   */
  cause?: EventCauseDTO;
  /** The record's raw `WeightContext`, when it had one. */
  weight_context?: number;
}

export interface SurePetDeviceDetailPayload extends SurePetCloudDevice {
  status?: SurePetDeviceStatusPayload;
  control?: SurePetDeviceControlPayload;
}
