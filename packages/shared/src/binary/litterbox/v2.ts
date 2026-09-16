import {
  LITTERBOX_DELTA_ESCAPE_U16,
  LITTERBOX_RAW_DATA_VERSION_2,
} from './constants.ts';
import {
  CONTEXT_BLOCK_BYTES,
  centigrams,
  readContextBlock,
  writeContextBlock,
} from './contextFields.ts';
import type {
  DecodedLitterboxRawData,
  EncodeLitterboxRawDataV2Input,
} from './types.ts';

// Layout doc lives on EncodeLitterboxRawDataV2Input in types.ts.
const HEADER_BYTES = 1 + 8 + CONTEXT_BLOCK_BYTES + 4;

export function encodeLitterboxRawDataV2(
  input: EncodeLitterboxRawDataV2Input,
): Uint8Array {
  const count = input.weights.length;
  if (input.sampleOffsetsMs.length !== count) {
    throw new Error('sampleOffsetsMs must have the same length as weights');
  }

  // Deltas from the previous sample (first = offset from startTimeMs),
  // clamped to >= 0 so a non-monotonic clock can't corrupt the stream.
  const deltas = new Array<number>(count);
  let previous = 0;
  for (let i = 0; i < count; i++) {
    const offset = input.sampleOffsetsMs[i];
    const delta = Math.max(
      0,
      Math.min(4294967295, Math.round(offset - previous)),
    );
    deltas[i] = delta;
    previous += delta;
  }

  let deltaBytes = 0;
  for (const delta of deltas) {
    deltaBytes += delta >= LITTERBOX_DELTA_ESCAPE_U16 ? 6 : 2;
  }

  const buf = new Uint8Array(HEADER_BYTES + count * 4 + deltaBytes);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  let offset = 0;
  view.setUint8(offset, LITTERBOX_RAW_DATA_VERSION_2);
  offset += 1;
  view.setBigUint64(offset, BigInt(Math.trunc(input.startTimeMs)));
  offset += 8;

  offset = writeContextBlock(view, offset, input.context);

  view.setUint32(offset, count);
  offset += 4;

  for (const w of input.weights) {
    view.setInt32(offset, centigrams(w));
    offset += 4;
  }

  for (const delta of deltas) {
    if (delta >= LITTERBOX_DELTA_ESCAPE_U16) {
      view.setUint16(offset, LITTERBOX_DELTA_ESCAPE_U16);
      offset += 2;
      view.setUint32(offset, delta);
      offset += 4;
    } else {
      view.setUint16(offset, delta);
      offset += 2;
    }
  }

  return buf;
}

export function decodeLitterboxRawDataV2(
  raw: Uint8Array,
): DecodedLitterboxRawData | null {
  if (raw.length < HEADER_BYTES) {
    return null;
  }

  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);

  let offset = 0;
  const version = view.getUint8(offset);
  offset += 1;

  if (version !== LITTERBOX_RAW_DATA_VERSION_2) {
    return null;
  }

  const startTimeMs = Number(view.getBigUint64(offset));
  offset += 8;

  const context = readContextBlock(view, offset);
  offset += CONTEXT_BLOCK_BYTES;

  const count = view.getUint32(offset);
  offset += 4;

  const availableCount = Math.floor((raw.length - offset) / 4);
  const weightsCount = Math.min(count, availableCount);

  const weights = new Array<number>(weightsCount);
  for (let i = 0; i < weightsCount; i++) {
    weights[i] = view.getInt32(offset) / 100;
    offset += 4;
  }

  // Lenient like the weights: reconstruct cumulative offsets from however
  // many complete deltas survive (a trailing partial escape is dropped).
  // If the weights section itself is incomplete, the delta section's start
  // is unknowable — skip it rather than misread weight bytes as deltas.
  const sampleOffsetsMs: number[] = [];
  let cumulative = 0;
  while (
    weightsCount === count &&
    sampleOffsetsMs.length < weightsCount &&
    offset + 2 <= raw.length
  ) {
    let delta = view.getUint16(offset);
    offset += 2;
    if (delta === LITTERBOX_DELTA_ESCAPE_U16) {
      if (offset + 4 > raw.length) {
        break;
      }
      delta = view.getUint32(offset);
      offset += 4;
    }
    cumulative += delta;
    sampleOffsetsMs.push(cumulative);
  }

  return {
    version,
    startTime: Number.isFinite(startTimeMs) ? new Date(startTimeMs) : null,
    context,
    weights,
    sampleOffsetsMs,
  };
}
