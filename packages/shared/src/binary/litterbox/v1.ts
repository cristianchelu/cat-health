import {
  LITTERBOX_NULL_U16,
  LITTERBOX_NULL_U8,
  LITTERBOX_RAW_DATA_VERSION_1,
} from "./constants.ts";
import type {
  DecodedLitterboxContext,
  DecodedLitterboxRawData,
  EncodeLitterboxRawDataV1Input,
} from "./types.ts";

const HEADER_MIN = 1 + 8 + 10 + 4;

export function decodeLitterboxRawDataV1(
  raw: Uint8Array,
): DecodedLitterboxRawData | null {
  if (raw.length < HEADER_MIN) {
    return null;
  }

  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);

  let offset = 0;
  const version = view.getUint8(offset);
  offset += 1;

  if (version !== LITTERBOX_RAW_DATA_VERSION_1) {
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

  offset += 2; // reserved

  const count = view.getUint32(offset);
  offset += 4;

  const availableCount = Math.floor((raw.length - offset) / 2);
  const weightsCount = Math.min(count, availableCount);

  const weights: number[] = new Array(weightsCount);
  for (let i = 0; i < weightsCount; i++) {
    weights[i] = view.getInt16(offset);
    offset += 2;
  }

  const context: DecodedLitterboxContext = {
    wasteWeight:
      wasteWeightRaw === LITTERBOX_NULL_U16 ? undefined : wasteWeightRaw,
    litterRemaining:
      litterRemainingRaw === LITTERBOX_NULL_U16
        ? undefined
        : litterRemainingRaw,
    deepCleanTimer:
      deepCleanTimerRaw === LITTERBOX_NULL_U8 ? undefined : deepCleanTimerRaw,
    totalVisits:
      totalVisitsRaw === LITTERBOX_NULL_U8 ? undefined : totalVisitsRaw,
    daysSinceLitterReplaced:
      daysSinceLitterReplacedRaw === LITTERBOX_NULL_U8
        ? undefined
        : daysSinceLitterReplacedRaw,
    hoursSinceLastScoop:
      hoursSinceLastScoopRaw === LITTERBOX_NULL_U8
        ? undefined
        : hoursSinceLastScoopRaw,
  };

  return {
    startTime: Number.isFinite(startTimeMs) ? new Date(startTimeMs) : null,
    context,
    weights,
  };
}

export function encodeLitterboxRawDataV1(
  input: EncodeLitterboxRawDataV1Input,
): Uint8Array {
  const count = input.weights.length;
  const buf = new Uint8Array(HEADER_MIN + count * 2);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  let offset = 0;
  view.setUint8(offset, LITTERBOX_RAW_DATA_VERSION_1);
  offset += 1;

  view.setBigUint64(offset, BigInt(Math.trunc(input.startTimeMs)));
  offset += 8;

  if (input.context) {
    const wasteWeight = Math.min(
      65534,
      Math.max(0, Math.round(input.context.wasteWeight)),
    );
    view.setUint16(offset, wasteWeight);
    offset += 2;

    const litterRemaining = Math.min(
      65534,
      Math.max(0, Math.round(input.context.litterRemaining)),
    );
    view.setUint16(offset, litterRemaining);
    offset += 2;

    const deepCleanTimer = Math.min(
      254,
      Math.max(0, Math.round(input.context.deepCleanTimer)),
    );
    view.setUint8(offset, deepCleanTimer);
    offset += 1;

    const totalVisits = Math.min(
      254,
      Math.max(0, Math.round(input.context.totalVisits)),
    );
    view.setUint8(offset, totalVisits);
    offset += 1;

    const daysSinceLitterReplaced = Math.min(
      254,
      Math.max(0, Math.round(input.context.daysSinceLitterReplaced)),
    );
    view.setUint8(offset, daysSinceLitterReplaced);
    offset += 1;

    const hoursSinceLastScoop = Math.min(
      254,
      Math.max(0, Math.round(input.context.hoursSinceLastScoop)),
    );
    view.setUint8(offset, hoursSinceLastScoop);
    offset += 1;
  } else {
    view.setUint16(offset, LITTERBOX_NULL_U16);
    offset += 2;
    view.setUint16(offset, LITTERBOX_NULL_U16);
    offset += 2;
    view.setUint8(offset, LITTERBOX_NULL_U8);
    offset += 1;
    view.setUint8(offset, LITTERBOX_NULL_U8);
    offset += 1;
    view.setUint8(offset, LITTERBOX_NULL_U8);
    offset += 1;
    view.setUint8(offset, LITTERBOX_NULL_U8);
    offset += 1;
  }

  view.setUint16(offset, 0);
  offset += 2;

  view.setUint32(offset, count);
  offset += 4;

  for (const w of input.weights) {
    const weight = Math.round(w);
    const clamped = Math.max(-32768, Math.min(32767, weight));
    view.setInt16(offset, clamped);
    offset += 2;
  }

  return buf;
}
