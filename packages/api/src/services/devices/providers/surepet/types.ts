/** Ported / inferred SurePetcare API response shapes. */

import type { SubstanceTypeId } from './constants.ts';

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
  frames?: SurePetTimelineWeightFrame[] | null;
}

export interface SurePetTimelinePetRef {
  id?: number;
  tag_id?: number | null;
}

export interface SurePetTimelineEntry {
  id?: number;
  type?: number | null;
  created_at?: string | null;
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

export interface SurePetFeedingDatapoint {
  from?: string | null;
  to?: string | null;
  duration?: number | null;
  actual_weight?: number | null;
  weights?: Array<{ weight?: number | null }> | null;
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
}

export interface SurePetDeviceDetailPayload extends SurePetCloudDevice {
  status?: SurePetDeviceStatusPayload;
  control?: SurePetDeviceControlPayload;
}
