import { LITTERBOX_NULL_I32, LITTERBOX_NULL_U16 } from './constants.ts';
import type {
  DecodedLitterboxContext,
  LitterboxRawDataV2Context,
} from './types.ts';

/**
 * The context block shared by raw_data v2 and v3 (big-endian, 18 bytes):
 * ```
 * +0   i32  wasteWeight centigrams, INT32_MIN = null
 * +4   i32  litterRemaining centigrams, INT32_MIN = null
 * +8   u16  daysSinceDeepClean, 0xFFFF = null
 * +10  u16  visitsSinceScoop, 0xFFFF = null
 * +12  u16  urinationsSinceScoop, 0xFFFF = null
 * +14  u16  defecationsSinceScoop, 0xFFFF = null
 * +16  u16  reserved = 0
 * ```
 */
export const CONTEXT_BLOCK_BYTES = 4 + 4 + 2 + 2 + 2 + 2 + 2;

const INT32_MAX = 2147483647;

/** Grams at 0.01 g in an i32; null and non-finite become the sentinel. */
export function centigrams(grams: number | undefined): number {
  if (grams == null || !Number.isFinite(grams)) {
    return LITTERBOX_NULL_I32;
  }
  // LITTERBOX_NULL_I32 is reserved as the null sentinel.
  return Math.max(
    LITTERBOX_NULL_I32 + 1,
    Math.min(INT32_MAX, Math.round(grams * 100)),
  );
}

function nullableU16(value: number | undefined): number {
  if (value == null || !Number.isFinite(value)) {
    return LITTERBOX_NULL_U16;
  }
  return Math.max(0, Math.min(LITTERBOX_NULL_U16 - 1, Math.round(value)));
}

export function writeContextBlock(
  view: DataView,
  offset: number,
  context: LitterboxRawDataV2Context | undefined,
): number {
  view.setInt32(offset, centigrams(context?.wasteWeight));
  view.setInt32(offset + 4, centigrams(context?.litterRemaining));
  view.setUint16(offset + 8, nullableU16(context?.daysSinceDeepClean));
  view.setUint16(offset + 10, nullableU16(context?.visitsSinceScoop));
  view.setUint16(offset + 12, nullableU16(context?.urinationsSinceScoop));
  view.setUint16(offset + 14, nullableU16(context?.defecationsSinceScoop));
  view.setUint16(offset + 16, 0);
  return offset + CONTEXT_BLOCK_BYTES;
}

export function readContextBlock(
  view: DataView,
  offset: number,
): DecodedLitterboxContext {
  const context: DecodedLitterboxContext = {};
  const wasteWeight = view.getInt32(offset);
  const litterRemaining = view.getInt32(offset + 4);
  const daysSinceDeepClean = view.getUint16(offset + 8);
  const visitsSinceScoop = view.getUint16(offset + 10);
  const urinationsSinceScoop = view.getUint16(offset + 12);
  const defecationsSinceScoop = view.getUint16(offset + 14);
  if (wasteWeight !== LITTERBOX_NULL_I32) {
    context.wasteWeight = wasteWeight / 100;
  }
  if (litterRemaining !== LITTERBOX_NULL_I32) {
    context.litterRemaining = litterRemaining / 100;
  }
  if (daysSinceDeepClean !== LITTERBOX_NULL_U16) {
    context.daysSinceDeepClean = daysSinceDeepClean;
  }
  if (visitsSinceScoop !== LITTERBOX_NULL_U16) {
    context.visitsSinceScoop = visitsSinceScoop;
  }
  if (urinationsSinceScoop !== LITTERBOX_NULL_U16) {
    context.urinationsSinceScoop = urinationsSinceScoop;
  }
  if (defecationsSinceScoop !== LITTERBOX_NULL_U16) {
    context.defecationsSinceScoop = defecationsSinceScoop;
  }
  return context;
}
