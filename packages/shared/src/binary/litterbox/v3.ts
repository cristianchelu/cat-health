import { LITTERBOX_RAW_DATA_VERSION_3 } from './constants.ts';
import {
  CONTEXT_BLOCK_BYTES,
  readContextBlock,
  writeContextBlock,
} from './contextFields.ts';
import type {
  DecodedLitterboxRawData,
  EncodeLitterboxRawDataV3Input,
} from './types.ts';
import { decodeLitterboxVisitFrame } from './visitFrame.ts';

// Layout doc lives on EncodeLitterboxRawDataV3Input in types.ts.
const HEADER_BYTES = 1 + 8 + CONTEXT_BLOCK_BYTES;

export function encodeLitterboxRawDataV3(
  input: EncodeLitterboxRawDataV3Input,
): Uint8Array {
  const buf = new Uint8Array(HEADER_BYTES + input.frame.length);
  const view = new DataView(buf.buffer);
  view.setUint8(0, LITTERBOX_RAW_DATA_VERSION_3);
  view.setBigUint64(1, BigInt(Math.trunc(input.startTimeMs)));
  writeContextBlock(view, 9, input.context);
  buf.set(input.frame, HEADER_BYTES);
  return buf;
}

/** The device frame inside a v3 blob, for replay tooling. */
export function litterboxRawDataV3Frame(raw: Uint8Array): Uint8Array | null {
  if (raw.length < HEADER_BYTES || raw[0] !== LITTERBOX_RAW_DATA_VERSION_3) {
    return null;
  }
  return raw.subarray(HEADER_BYTES);
}

export function decodeLitterboxRawDataV3(
  raw: Uint8Array,
): DecodedLitterboxRawData | null {
  const frameBytes = litterboxRawDataV3Frame(raw);
  if (!frameBytes) return null;
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const startTimeMs = Number(view.getBigUint64(1));
  const context = readContextBlock(view, 9);
  const decoded = decodeLitterboxVisitFrame(frameBytes);
  if (!decoded.ok) return null;
  return {
    version: LITTERBOX_RAW_DATA_VERSION_3,
    startTime: Number.isFinite(startTimeMs) ? new Date(startTimeMs) : null,
    context,
    weights: decoded.frame.weights,
    sampleOffsetsMs: decoded.frame.sampleOffsetsMs,
    deviceVisit: decoded.frame,
  };
}
