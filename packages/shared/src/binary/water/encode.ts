import { WATER_RAW_DATA_VERSION_1 } from './constants.ts';
import { encodeWaterRawDataV1 } from './v1.ts';
import type { EncodeWaterRawDataInput } from './types.ts';

/** Encode fountain weight samples into compact binary `raw_data`. */
export function encodeWaterRawData(input: EncodeWaterRawDataInput): Uint8Array {
  if (input.version === WATER_RAW_DATA_VERSION_1) {
    return encodeWaterRawDataV1(input);
  }
  throw new Error('Unsupported water raw_data version');
}
