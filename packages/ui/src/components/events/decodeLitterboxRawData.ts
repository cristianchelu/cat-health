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

const NULL_U16 = 65535;
const NULL_U8 = 255;

export function decodeLitterboxRawData(
  rawData: number[] | null | undefined,
): DecodedLitterboxRawData | null {
  if (!rawData || rawData.length < 1 + 8 + 10 + 4) {
    return null;
  }

  const bytes = Uint8Array.from(rawData);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  let offset = 0;
  const version = view.getUint8(offset);
  offset += 1;

  if (version !== 1) {
    return null;
  }

  const startTimeMs = Number(view.getBigUint64(offset));
  offset += 8;

  const wasteWeightRaw = view.getUint16(offset);
  offset += 2;
  const litterRemainingRaw = view.getUint16(offset);
  offset += 2;
  const deepCleanTimerRaw = view.getUint8(offset);
  offset += 1;
  const totalVisitsRaw = view.getUint8(offset);
  offset += 1;
  const daysSinceLitterReplacedRaw = view.getUint8(offset);
  offset += 1;
  const hoursSinceLastScoopRaw = view.getUint8(offset);
  offset += 1;

  // Reserved bytes
  offset += 2;

  const count = view.getUint32(offset);
  offset += 4;

  const availableCount = Math.floor((bytes.length - offset) / 2);
  const weightsCount = Math.min(count, availableCount);

  const weights: number[] = new Array(weightsCount);
  for (let i = 0; i < weightsCount; i++) {
    weights[i] = view.getInt16(offset);
    offset += 2;
  }

  const context: DecodedLitterboxContext = {
    wasteWeight: wasteWeightRaw === NULL_U16 ? undefined : wasteWeightRaw,
    litterRemaining:
      litterRemainingRaw === NULL_U16 ? undefined : litterRemainingRaw,
    deepCleanTimer:
      deepCleanTimerRaw === NULL_U8 ? undefined : deepCleanTimerRaw,
    totalVisits: totalVisitsRaw === NULL_U8 ? undefined : totalVisitsRaw,
    daysSinceLitterReplaced:
      daysSinceLitterReplacedRaw === NULL_U8
        ? undefined
        : daysSinceLitterReplacedRaw,
    hoursSinceLastScoop:
      hoursSinceLastScoopRaw === NULL_U8 ? undefined : hoursSinceLastScoopRaw,
  };

  return {
    startTime: Number.isFinite(startTimeMs) ? new Date(startTimeMs) : null,
    context,
    weights,
  };
}
