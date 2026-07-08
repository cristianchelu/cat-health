import type { WATER_RAW_DATA_VERSION_1 } from './constants.ts';

export interface DecodedWaterContext {
  waterLevel?: number;
}

export interface DecodedWaterRawData {
  version: number;
  startTime: Date | null;
  context: DecodedWaterContext;
  weights: number[];
}

export interface EncodeWaterRawDataV1Input {
  version: typeof WATER_RAW_DATA_VERSION_1;
  startTimeMs: number;
  context?: { waterLevel?: number | null };
  weights: number[];
}

export type EncodeWaterRawDataInput = EncodeWaterRawDataV1Input;
