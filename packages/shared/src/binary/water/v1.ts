import {
  WATER_NULL_U8,
  WATER_RAW_DATA_VERSION_1,
} from './constants.ts';
import type {
  DecodedWaterContext,
  DecodedWaterRawData,
  EncodeWaterRawDataV1Input,
} from './types.ts';

const HEADER_BYTES = 1 + 8 + 4 + 4;

export function decodeWaterRawDataV1(raw: Uint8Array): DecodedWaterRawData | null {
  if (raw.length < HEADER_BYTES) {
    return null;
  }

  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);

  let offset = 0;
  const version = view.getUint8(offset);
  offset += 1;

  if (version !== WATER_RAW_DATA_VERSION_1) {
    return null;
  }

  const startTimeMs = Number(view.getBigUint64(offset));
  offset += 8;

  const waterLevelRaw = view.getUint8(offset);
  offset += 1;
  offset += 3; // reserved

  const count = view.getUint32(offset);
  offset += 4;

  const available = Math.floor((raw.length - offset) / 4);
  const weightsCount = Math.min(count, available);

  const weights: number[] = new Array(weightsCount);
  for (let i = 0; i < weightsCount; i++) {
    weights[i] = view.getInt32(offset) / 100;
    offset += 4;
  }

  const context: DecodedWaterContext = {
    waterLevel: waterLevelRaw === WATER_NULL_U8 ? undefined : waterLevelRaw,
  };

  return {
    version,
    startTime: Number.isFinite(startTimeMs) ? new Date(startTimeMs) : null,
    context,
    weights,
  };
}

export function encodeWaterRawDataV1(
  input: EncodeWaterRawDataV1Input,
): Uint8Array {
  const count = input.weights.length;
  const buf = new Uint8Array(HEADER_BYTES + count * 4);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  let offset = 0;
  view.setUint8(offset, WATER_RAW_DATA_VERSION_1);
  offset += 1;
  view.setBigUint64(offset, BigInt(input.startTimeMs));
  offset += 8;

  const waterLevel =
    input.context?.waterLevel == null
      ? WATER_NULL_U8
      : Math.min(100, Math.max(0, Math.round(input.context.waterLevel)));
  view.setUint8(offset, waterLevel);
  offset += 1;
  view.setUint8(offset, 0);
  offset += 1;
  view.setUint16(offset, 0);
  offset += 2;

  view.setUint32(offset, count);
  offset += 4;

  for (const weight of input.weights) {
    view.setInt32(offset, Math.round(weight * 100));
    offset += 4;
  }

  return buf;
}
