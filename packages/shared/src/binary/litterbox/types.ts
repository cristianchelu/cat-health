/**
 * Maintenance terminology, pinned: "scoop" = remove waste from the litter
 * (the `litterbox_maintenance/scoop` event); "deep clean" = dump the litter,
 * wash the box, refill with fresh litter (`deep_clean` / `litter_change`
 * maintenance events both reset litter age).
 */
export interface DecodedLitterboxContext {
  wasteWeight?: number;
  litterRemaining?: number;
  /** v1 only: preset-relative countdown; superseded by daysSinceDeepClean. */
  deepCleanTimer?: number;
  /** v1 only: visits since scoop, under its old ambiguous name. */
  totalVisits?: number;
  /** v1 only: fabricated as `30 - deepCleanTimer`; do not trust. */
  daysSinceLitterReplaced?: number;
  /** v1 only: hardcoded 0 at ingest; do not trust. */
  hoursSinceLastScoop?: number;
  /** v2: days since the last deep_clean/litter_change maintenance event. */
  daysSinceDeepClean?: number;
  visitsSinceScoop?: number;
  urinationsSinceScoop?: number;
  defecationsSinceScoop?: number;
}

export interface DecodedLitterboxRawData {
  version: number;
  startTime: Date | null;
  context: DecodedLitterboxContext;
  weights: number[];
  /** v2+: per-sample ms offsets from `startTime`. Absent on v1 blobs. */
  sampleOffsetsMs?: number[];
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

/** v2 context; each field is independently nullable (null sentinel on the wire). */
export interface LitterboxRawDataV2Context {
  /** Float grams; stored at 0.01g. */
  wasteWeight?: number;
  /** Float grams; stored at 0.01g. */
  litterRemaining?: number;
  daysSinceDeepClean?: number;
  visitsSinceScoop?: number;
  urinationsSinceScoop?: number;
  defecationsSinceScoop?: number;
}

/**
 * v2 layout (big-endian):
 * ```
 * 0     u8   version = 2
 * 1     u64  startTimeMs
 * 9     i32  wasteWeight centigrams, INT32_MIN = null
 * 13    i32  litterRemaining centigrams, INT32_MIN = null
 * 17    u16  daysSinceDeepClean, 0xFFFF = null
 * 19    u16  visitsSinceScoop, 0xFFFF = null
 * 21    u16  urinationsSinceScoop, 0xFFFF = null
 * 23    u16  defecationsSinceScoop, 0xFFFF = null
 * 25    u16  reserved = 0
 * 27    u32  count
 * 31    count × i32  weight centigrams
 * then  timestamp deltas, variable length: u16 ms delta from the previous
 *       sample (first = offset of sample 0 from startTimeMs); 0xFFFF escapes
 *       to a following u32 full delta ms.
 * ```
 * Weights precede timestamps so a truncated blob still yields the full trace.
 */
export interface EncodeLitterboxRawDataV2Input {
  version: 2;
  startTimeMs: number;
  context?: LitterboxRawDataV2Context;
  /** Float grams; stored at 0.01g. */
  weights: number[];
  /** Per-sample ms offsets from startTimeMs; same length as `weights`. */
  sampleOffsetsMs: number[];
}

export type EncodeLitterboxRawDataInput =
  | EncodeLitterboxRawDataV1Input
  | EncodeLitterboxRawDataV2Input;
