export interface DecodedWaterContext {
  waterLevel?: number; // percent 0-100
}

export interface DecodedWaterRawData {
  version: number;
  startTime: Date | null;
  context: DecodedWaterContext;
  weights: number[]; // grams (0.01 g resolution), recorded at ~10 Hz
}

const NULL_U8 = 255;

// Header: version(1) + startTs(8) + context(4) + count(4) = 17 bytes
const MIN_HEADER_BYTES = 17;

export function decodeWaterRawData(
  rawData: number[] | null | undefined,
): DecodedWaterRawData | null {
  if (!rawData || rawData.length < MIN_HEADER_BYTES) return null;

  const bytes = Uint8Array.from(rawData);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  let offset = 0;

  const version = view.getUint8(offset); offset += 1;
  if (version !== 1) return null;

  const startTimeMs = Number(view.getBigUint64(offset)); offset += 8;

  const waterLevelRaw = view.getUint8(offset); offset += 1;
  offset += 3; // reserved

  const count = view.getUint32(offset); offset += 4;

  const available = Math.floor((bytes.length - offset) / 4);
  const weightsCount = Math.min(count, available);

  const weights: number[] = new Array(weightsCount);
  for (let i = 0; i < weightsCount; i++) {
    weights[i] = view.getInt32(offset) / 100;
    offset += 4;
  }

  return {
    version,
    startTime: Number.isFinite(startTimeMs) ? new Date(startTimeMs) : null,
    context: {
      waterLevel: waterLevelRaw === NULL_U8 ? undefined : waterLevelRaw,
    },
    weights,
  };
}
