import { WATER_RAW_DATA_VERSION_1 } from './constants.ts';
import { decodeWaterRawDataV1 } from './v1.ts';
import type { DecodedWaterRawData } from './types.ts';

/** Decode water fountain `raw_data` (versioned blob). */
export function decodeWaterRawData(
  raw: Uint8Array | null | undefined,
): DecodedWaterRawData | null {
  if (!raw || raw.length < 1) {
    return null;
  }
  const version = raw[0];
  if (version === WATER_RAW_DATA_VERSION_1) {
    return decodeWaterRawDataV1(raw);
  }
  return null;
}
