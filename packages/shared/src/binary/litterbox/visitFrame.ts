import { Type, type Static } from '@fastify/type-provider-typebox';
import { parseWithSchema } from '../../schemas/runtimeSchema.ts';

/**
 * The visit record the litterbox firmware publishes on `<topic>/visit/last`
 * (`visit_blob.h` in esphome-litterbox-monitor), decoded here so the server
 * can store it, replay it and diff its verdict against the device's.
 *
 * Layout: `"LBV1"`, u32 LE sample count, that many int16 LE codes, then a
 * JSON trailer to the end of the buffer. The codes are the device's
 * `WeightBuffer` verbatim: each zone in the trailer decodes the codes from
 * its `start` index to the next zone's start as `baseline + code / scale`
 * (`scale` 1 = absolute grams, 10 = 0.1 g steps around a baseline). Samples
 * are nominally 100 ms apart; `drops` lists `[index, gap_ms]` for every
 * sample that arrived more than 150 ms after the previous one.
 */
export const LITTERBOX_VISIT_FRAME_MAGIC = 'LBV1';
export const LITTERBOX_VISIT_SAMPLE_INTERVAL_MS = 100;
const HEADER_BYTES = 8;

const NUMBER = Type.Number();

export const LitterboxVisitZoneSchema = Type.Tuple([NUMBER, NUMBER, NUMBER]);

export const LitterboxVisitPeriodSchema = Type.Tuple([
  Type.String(),
  NUMBER,
  NUMBER,
  NUMBER,
]);

export const LitterboxVisitVerdictSchema = Type.Object({
  cat_weight: NUMBER,
  waste_weight: NUMBER,
  type: Type.String(),
  cat: NUMBER,
  periods: Type.Array(LitterboxVisitPeriodSchema),
});
export type LitterboxVisitVerdict = Static<typeof LitterboxVisitVerdictSchema>;

export const LitterboxVisitBoxSchema = Type.Object({
  kind: Type.String(),
  level: NUMBER,
  added: NUMBER,
  box: NUMBER,
  zero_valid: Type.Boolean(),
  zero: NUMBER,
  absent: Type.Boolean(),
  scooped: Type.Boolean(),
});
export type LitterboxVisitBox = Static<typeof LitterboxVisitBoxSchema>;

export const LitterboxVisitConfigSchema = Type.Object({
  cat_weights: Type.Array(NUMBER),
  sd_threshold: NUMBER,
  tare: NUMBER,
  auto_tare: NUMBER,
  spike: NUMBER,
  vibration: NUMBER,
  activity_off: NUMBER,
  timeout: NUMBER,
  box: Type.Object({
    box_g: NUMBER,
    off_tol: NUMBER,
    empty_tol: NUMBER,
    lift: NUMBER,
    return_tol: NUMBER,
    top_up_min: NUMBER,
    scoop_min: NUMBER,
    scoop_min_s: NUMBER,
    settle_s: NUMBER,
  }),
});

export const LitterboxVisitTrailerSchema = Type.Object({
  /** Event start, epoch seconds on the device clock; the visit's identity. */
  id: NUMBER,
  ended: NUMBER,
  clock_valid: Type.Boolean(),
  /** Seconds. */
  duration: NUMBER,
  /** Samples the analyzer consumed; `stored` is how many fit the buffer. */
  samples: NUMBER,
  stored: NUMBER,
  long_enough: Type.Boolean(),
  /** A cat was already scored in the event this one continues. */
  continued: Type.Boolean(),
  drops: Type.Array(Type.Tuple([NUMBER, NUMBER])),
  drops_overflow: Type.Boolean(),
  zones: Type.Array(LitterboxVisitZoneSchema),
  visit: Type.Union([LitterboxVisitVerdictSchema, Type.Null()]),
  box: LitterboxVisitBoxSchema,
  config: LitterboxVisitConfigSchema,
  fw: Type.Object({ project: Type.String(), version: Type.String() }),
});
export type LitterboxVisitTrailer = Static<typeof LitterboxVisitTrailerSchema>;

/** What the device writes when the trailer would not fit the frame. */
export const LitterboxVisitTruncatedTrailerSchema = Type.Object({
  id: NUMBER,
  stored: NUMBER,
  truncated: Type.Literal(true),
});

export interface DecodedLitterboxVisitFrame {
  trailer: LitterboxVisitTrailer;
  /** Raw int16 codes, as stored on the device. */
  codes: Int16Array;
  /** Tared grams per sample, exactly what the device's analyzer consumed. */
  weights: number[];
  /** Milliseconds from the first sample, at the nominal cadence plus drops. */
  sampleOffsetsMs: number[];
}

export type LitterboxVisitFrameResult =
  | { ok: true; frame: DecodedLitterboxVisitFrame }
  | { ok: false; reason: 'not_a_frame' | 'bad_trailer' | 'truncated' };

function readFrameParts(
  raw: Uint8Array,
): { codes: Int16Array; trailerText: string } | null {
  if (raw.length < HEADER_BYTES) return null;
  const magic = String.fromCharCode(raw[0], raw[1], raw[2], raw[3]);
  if (magic !== LITTERBOX_VISIT_FRAME_MAGIC) return null;
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const count = view.getUint32(4, true);
  const samplesEnd = HEADER_BYTES + count * 2;
  if (samplesEnd > raw.length) return null;
  const codes = new Int16Array(count);
  for (let i = 0; i < count; i++) {
    codes[i] = view.getInt16(HEADER_BYTES + i * 2, true);
  }
  const trailerText = new TextDecoder().decode(raw.subarray(samplesEnd));
  return { codes, trailerText };
}

function parseTrailerJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Grams for each code, through the zone table. */
export function decodeLitterboxVisitSamples(
  codes: ArrayLike<number>,
  zones: ReadonlyArray<readonly [number, number, number]>,
): number[] {
  const weights = new Array<number>(codes.length);
  for (let z = 0; z < zones.length; z++) {
    const [start, baseline, scale] = zones[z];
    const end = z + 1 < zones.length ? zones[z + 1][0] : codes.length;
    for (let i = Math.max(0, start); i < Math.min(end, codes.length); i++) {
      weights[i] = scale === 1 ? codes[i] : baseline + codes[i] / scale;
    }
  }
  // A code before the first zone or past a malformed table has no decoding;
  // 0 keeps the trace the right length rather than dropping samples.
  for (let i = 0; i < weights.length; i++) {
    if (weights[i] === undefined) weights[i] = 0;
  }
  return weights;
}

/** Offsets from the first sample: nominal cadence, stretched at each drop. */
export function litterboxVisitSampleOffsetsMs(
  count: number,
  drops: ReadonlyArray<readonly [number, number]>,
): number[] {
  const gaps = new Map<number, number>();
  for (const [index, gapMs] of drops) gaps.set(index, gapMs);
  const offsets = new Array<number>(count);
  let at = 0;
  for (let i = 0; i < count; i++) {
    if (i > 0) at += gaps.get(i) ?? LITTERBOX_VISIT_SAMPLE_INTERVAL_MS;
    offsets[i] = at;
  }
  return offsets;
}

export function decodeLitterboxVisitFrame(
  raw: Uint8Array,
): LitterboxVisitFrameResult {
  const parts = readFrameParts(raw);
  if (!parts) return { ok: false, reason: 'not_a_frame' };
  const json = parseTrailerJson(parts.trailerText);
  if (parseWithSchema(LitterboxVisitTruncatedTrailerSchema, json)) {
    return { ok: false, reason: 'truncated' };
  }
  const trailer = parseWithSchema(LitterboxVisitTrailerSchema, json);
  if (!trailer) return { ok: false, reason: 'bad_trailer' };
  return {
    ok: true,
    frame: {
      trailer,
      codes: parts.codes,
      weights: decodeLitterboxVisitSamples(parts.codes, trailer.zones),
      sampleOffsetsMs: litterboxVisitSampleOffsetsMs(
        parts.codes.length,
        trailer.drops,
      ),
    },
  };
}

/** The device's framing, for fixtures and tests; the firmware is the writer. */
export function encodeLitterboxVisitFrame(
  codes: ArrayLike<number>,
  trailer: LitterboxVisitTrailer,
): Uint8Array {
  const trailerBytes = new TextEncoder().encode(JSON.stringify(trailer));
  const buf = new Uint8Array(
    HEADER_BYTES + codes.length * 2 + trailerBytes.length,
  );
  const view = new DataView(buf.buffer);
  for (let i = 0; i < 4; i++) {
    buf[i] = LITTERBOX_VISIT_FRAME_MAGIC.charCodeAt(i);
  }
  view.setUint32(4, codes.length, true);
  for (let i = 0; i < codes.length; i++) {
    view.setInt16(HEADER_BYTES + i * 2, codes[i], true);
  }
  buf.set(trailerBytes, HEADER_BYTES + codes.length * 2);
  return buf;
}

/** Whether a byte buffer starts with the visit-frame magic. */
export function isLitterboxVisitFrame(raw: Uint8Array): boolean {
  return (
    raw.length >= 4 &&
    String.fromCharCode(raw[0], raw[1], raw[2], raw[3]) ===
      LITTERBOX_VISIT_FRAME_MAGIC
  );
}
