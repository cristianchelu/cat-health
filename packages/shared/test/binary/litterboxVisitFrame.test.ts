import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  decodeLitterboxRawData,
  decodeLitterboxVisitFrame,
  encodeLitterboxRawData,
  encodeLitterboxVisitFrame,
  LITTERBOX_RAW_DATA_VERSION_3,
  litterboxRawDataV3Frame,
  type LitterboxVisitTrailer,
} from '../../src/binary/litterbox/index.ts';

/** A device record shaped like `visit_blob.h` writes it, with two zones. */
export function sampleTrailer(
  overrides: Partial<LitterboxVisitTrailer> = {},
): LitterboxVisitTrailer {
  return {
    id: 1_789_000_000,
    ended: 1_789_000_030,
    clock_valid: true,
    duration: 30,
    samples: 6,
    stored: 6,
    long_enough: true,
    continued: false,
    drops: [[4, 400]],
    drops_overflow: false,
    // Absolute grams for the first three, then 0.1 g steps around 4000 g.
    zones: [
      [0, 0, 1],
      [3, 4000, 10],
    ],
    visit: {
      cat_weight: 4012.5,
      waste_weight: 25,
      type: 'urination',
      cat: 1,
      periods: [
        ['entering', 0, 2, 0],
        ['eliminating', 3, 5, 1.5],
      ],
    },
    box: {
      kind: 'none',
      level: 0,
      added: 0,
      box: 0,
      zero_valid: false,
      zero: 0,
      absent: false,
      scooped: false,
    },
    config: {
      cat_weights: [3.2, 4.0, 0, 0, 0],
      sd_threshold: 4,
      tare: 1.5,
      auto_tare: 0,
      spike: 0.5,
      vibration: 0.02,
      activity_off: 4,
      timeout: 120,
      box: {
        box_g: 1500,
        off_tol: 100,
        empty_tol: 150,
        lift: 1000,
        return_tol: 100,
        top_up_min: 300,
        scoop_min: 20,
        scoop_min_s: 5,
        settle_s: 30,
      },
    },
    fw: { project: 'CristianChelu.LitterboxMonitor', version: 'esp32s3.hx711' },
    ...overrides,
  };
}

export const SAMPLE_CODES = [0, 1500, 3980, 120, 125, 130];

describe('litterbox visit frame', () => {
  it('decodes codes through the zone table and spaces samples by drops', () => {
    const result = decodeLitterboxVisitFrame(
      encodeLitterboxVisitFrame(SAMPLE_CODES, sampleTrailer()),
    );
    assert.ok(result.ok);
    const { frame } = result;
    assert.deepEqual(Array.from(frame.codes), SAMPLE_CODES);
    assert.deepEqual(frame.weights, [0, 1500, 3980, 4012, 4012.5, 4013]);
    assert.deepEqual(frame.sampleOffsetsMs, [0, 100, 200, 300, 700, 800]);
    assert.equal(frame.trailer.visit?.type, 'urination');
    assert.equal(frame.trailer.fw.version, 'esp32s3.hx711');
  });

  it('accepts a visit-less record', () => {
    const result = decodeLitterboxVisitFrame(
      encodeLitterboxVisitFrame(
        [0, 0],
        sampleTrailer({
          visit: null,
          long_enough: false,
          samples: 2,
          stored: 2,
        }),
      ),
    );
    assert.ok(result.ok);
    assert.equal(result.frame.trailer.visit, null);
  });

  it('rejects foreign payloads, torn trailers and the truncated form', () => {
    assert.deepEqual(
      decodeLitterboxVisitFrame(new TextEncoder().encode('{}')),
      {
        ok: false,
        reason: 'not_a_frame',
      },
    );

    const whole = encodeLitterboxVisitFrame(SAMPLE_CODES, sampleTrailer());
    assert.deepEqual(
      decodeLitterboxVisitFrame(whole.subarray(0, whole.length - 5)),
      {
        ok: false,
        reason: 'bad_trailer',
      },
    );

    const truncated = new Uint8Array([
      ...whole.subarray(0, 8 + SAMPLE_CODES.length * 2),
      ...new TextEncoder().encode(
        '{"id":1789000000,"stored":6,"truncated":true}',
      ),
    ]);
    assert.deepEqual(decodeLitterboxVisitFrame(truncated), {
      ok: false,
      reason: 'truncated',
    });
  });
});

describe('litterbox raw_data v3', () => {
  it('keeps the device frame verbatim behind the server context', () => {
    const frame = encodeLitterboxVisitFrame(SAMPLE_CODES, sampleTrailer());
    const startTimeMs = Date.UTC(2026, 8, 12, 7, 30, 0);
    const encoded = encodeLitterboxRawData({
      version: LITTERBOX_RAW_DATA_VERSION_3,
      startTimeMs,
      context: { wasteWeight: 42.5, visitsSinceScoop: 3 },
      frame,
    });

    assert.deepEqual(litterboxRawDataV3Frame(encoded), frame);

    const decoded = decodeLitterboxRawData(encoded);
    assert.ok(decoded);
    assert.equal(decoded.version, 3);
    assert.equal(decoded.startTime?.getTime(), startTimeMs);
    assert.deepEqual(decoded.context, {
      wasteWeight: 42.5,
      visitsSinceScoop: 3,
    });
    assert.deepEqual(decoded.weights, [0, 1500, 3980, 4012, 4012.5, 4013]);
    assert.deepEqual(decoded.sampleOffsetsMs, [0, 100, 200, 300, 700, 800]);
    assert.equal(decoded.deviceVisit?.trailer.id, 1_789_000_000);
  });

  it('is null when the embedded frame does not decode', () => {
    const encoded = encodeLitterboxRawData({
      version: LITTERBOX_RAW_DATA_VERSION_3,
      startTimeMs: 0,
      frame: new TextEncoder().encode('garbage'),
    });
    assert.equal(decodeLitterboxRawData(encoded), null);
  });
});
