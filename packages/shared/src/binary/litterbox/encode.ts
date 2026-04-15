import { LITTERBOX_RAW_DATA_VERSION_1 } from './constants.ts';
import { encodeLitterboxRawDataV1 } from './v1.ts';
import type { EncodeLitterboxRawDataInput } from './types.ts';

/**
 * Encode structured litterbox visit data to the compact binary `raw_data` blob for storage / API.
 */
export function encodeLitterboxRawData(
  input: EncodeLitterboxRawDataInput,
): Uint8Array {
  if (input.version === LITTERBOX_RAW_DATA_VERSION_1) {
    return encodeLitterboxRawDataV1(input);
  }
  throw new Error('Unsupported litterbox raw_data version');
}
