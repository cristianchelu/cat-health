import {
  decodeLitterboxRawData as decodeLitterboxRawDataBytes,
  type DecodedLitterboxContext,
  type DecodedLitterboxRawData,
} from 'shared';

export type { DecodedLitterboxContext, DecodedLitterboxRawData };

export function decodeLitterboxRawData(
  rawData: number[] | null | undefined,
): DecodedLitterboxRawData | null {
  if (!rawData || rawData.length < 1) {
    return null;
  }
  return decodeLitterboxRawDataBytes(Uint8Array.from(rawData));
}
