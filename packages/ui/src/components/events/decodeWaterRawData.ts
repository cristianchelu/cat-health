import {
  decodeWaterRawData as decodeWaterRawDataBytes,
  type DecodedWaterContext,
  type DecodedWaterRawData,
} from 'shared';

export type { DecodedWaterContext, DecodedWaterRawData };

export function decodeWaterRawData(
  rawData: number[] | null | undefined,
): DecodedWaterRawData | null {
  if (!rawData || rawData.length < 1) {
    return null;
  }
  return decodeWaterRawDataBytes(Uint8Array.from(rawData));
}
