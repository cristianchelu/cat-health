import { LITTERBOX_RAW_DATA_VERSION_1 } from './constants.ts';
import { decodeLitterboxRawDataV1 } from './v1.ts';
import type { DecodedLitterboxRawData } from './types.ts';

/**
 * Decode litterbox `raw_data` (versioned blob). Returns `null` for unknown version or invalid buffer.
 */
export function decodeLitterboxRawData(
  raw: Uint8Array | null | undefined,
): DecodedLitterboxRawData | null {
  if (!raw || raw.length < 1) {
    return null;
  }
  const version = raw[0];
  if (version === LITTERBOX_RAW_DATA_VERSION_1) {
    return decodeLitterboxRawDataV1(raw);
  }
  return null;
}
