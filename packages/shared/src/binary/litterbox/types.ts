export interface DecodedLitterboxContext {
  wasteWeight?: number;
  litterRemaining?: number;
  deepCleanTimer?: number;
  totalVisits?: number;
  daysSinceLitterReplaced?: number;
  hoursSinceLastScoop?: number;
}

export interface DecodedLitterboxRawData {
  startTime: Date | null;
  context: DecodedLitterboxContext;
  weights: number[];
}

/** Context fields when encoding v1 (omit entire `context` to write null sentinels). */
export interface LitterboxRawDataV1Context {
  wasteWeight: number;
  litterRemaining: number;
  deepCleanTimer: number;
  totalVisits: number;
  daysSinceLitterReplaced: number;
  hoursSinceLastScoop: number;
}

export interface EncodeLitterboxRawDataV1Input {
  version: 1;
  startTimeMs: number;
  context?: LitterboxRawDataV1Context;
  weights: number[];
}

export type EncodeLitterboxRawDataInput = EncodeLitterboxRawDataV1Input;
