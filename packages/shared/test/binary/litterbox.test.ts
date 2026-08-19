import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  decodeLitterboxRawData,
  encodeLitterboxRawData,
  LITTERBOX_RAW_DATA_VERSION_1,
  LITTERBOX_RAW_DATA_VERSION_2,
} from '../../src/binary/litterbox/index.ts';

describe('litterbox raw_data v1', () => {
  it('round-trips weights, start time, and context', () => {
    const startTimeMs = Date.UTC(2026, 5, 1, 12, 0, 0);
    const encoded = encodeLitterboxRawData({
      version: LITTERBOX_RAW_DATA_VERSION_1,
      startTimeMs,
      context: {
        wasteWeight: 120,
        litterRemaining: 800,
        deepCleanTimer: 3,
        totalVisits: 2,
        daysSinceLitterReplaced: 5,
        hoursSinceLastScoop: 12,
      },
      weights: [4200, 4180, 4150, 4100],
    });

    const decoded = decodeLitterboxRawData(encoded);
    assert.ok(decoded);
    assert.equal(decoded.version, 1);
    assert.equal(decoded.sampleOffsetsMs, undefined);
    assert.equal(decoded.startTime?.getTime(), startTimeMs);
    assert.deepEqual(decoded.weights, [4200, 4180, 4150, 4100]);
    assert.equal(decoded.context.wasteWeight, 120);
    assert.equal(decoded.context.litterRemaining, 800);
    assert.equal(decoded.context.deepCleanTimer, 3);
    assert.equal(decoded.context.totalVisits, 2);
    assert.equal(decoded.context.daysSinceLitterReplaced, 5);
    assert.equal(decoded.context.hoursSinceLastScoop, 12);
  });

  it('writes null sentinels when context is omitted', () => {
    const encoded = encodeLitterboxRawData({
      version: LITTERBOX_RAW_DATA_VERSION_1,
      startTimeMs: 0,
      weights: [100, 101],
    });

    const decoded = decodeLitterboxRawData(encoded);
    assert.ok(decoded);
    assert.equal(decoded.context.wasteWeight, undefined);
    assert.equal(decoded.context.litterRemaining, undefined);
    assert.equal(decoded.context.deepCleanTimer, undefined);
    assert.equal(decoded.context.totalVisits, undefined);
    assert.equal(decoded.context.daysSinceLitterReplaced, undefined);
    assert.equal(decoded.context.hoursSinceLastScoop, undefined);
  });

  it('clamps out-of-range weight samples on encode', () => {
    const encoded = encodeLitterboxRawData({
      version: LITTERBOX_RAW_DATA_VERSION_1,
      startTimeMs: 0,
      weights: [40_000, -40_000],
    });

    const decoded = decodeLitterboxRawData(encoded);
    assert.ok(decoded);
    assert.deepEqual(decoded.weights, [32767, -32768]);
  });
});

describe('decodeLitterboxRawData', () => {
  it('returns null for empty or missing input', () => {
    assert.equal(decodeLitterboxRawData(null), null);
    assert.equal(decodeLitterboxRawData(undefined), null);
    assert.equal(decodeLitterboxRawData(new Uint8Array()), null);
  });

  it('returns null for truncated buffers', () => {
    const encoded = encodeLitterboxRawData({
      version: LITTERBOX_RAW_DATA_VERSION_1,
      startTimeMs: 0,
      weights: [1, 2, 3],
    });
    assert.equal(decodeLitterboxRawData(encoded.subarray(0, 10)), null);
  });

  it('returns null for unknown version byte', () => {
    const buf = new Uint8Array([99, 0, 0, 0, 0, 0, 0, 0, 0]);
    assert.equal(decodeLitterboxRawData(buf), null);
  });

  it('decodes only available weights when header count exceeds payload', () => {
    const encoded = encodeLitterboxRawData({
      version: LITTERBOX_RAW_DATA_VERSION_1,
      startTimeMs: 0,
      weights: [100, 200],
    });
    const corrupted = new Uint8Array(encoded);
    const view = new DataView(corrupted.buffer);
    view.setUint32(19, 99);

    const decoded = decodeLitterboxRawData(corrupted);
    assert.ok(decoded);
    assert.deepEqual(decoded.weights, [100, 200]);
  });
});

describe('encodeLitterboxRawData', () => {
  it('throws for unsupported version', () => {
    assert.throws(
      () =>
        encodeLitterboxRawData({
          version: 3 as 1,
          startTimeMs: 0,
          weights: [],
        }),
      /Unsupported litterbox raw_data version/,
    );
  });
});

describe('litterbox raw_data v2', () => {
  const startTimeMs = Date.UTC(2026, 7, 19, 8, 30, 0);

  it('round-trips 0.01g weights, sample offsets, start time, and context', () => {
    const encoded = encodeLitterboxRawData({
      version: LITTERBOX_RAW_DATA_VERSION_2,
      startTimeMs,
      context: {
        wasteWeight: 120.25,
        litterRemaining: 3805.07,
        daysSinceDeepClean: 12,
        visitsSinceScoop: 4,
        urinationsSinceScoop: 3,
        defecationsSinceScoop: 1,
      },
      weights: [4200.25, 4180.07, 4150.5, -12.34],
      sampleOffsetsMs: [42, 179, 316, 453],
    });

    const decoded = decodeLitterboxRawData(encoded);
    assert.ok(decoded);
    assert.equal(decoded.version, 2);
    assert.equal(decoded.startTime?.getTime(), startTimeMs);
    assert.deepEqual(decoded.weights, [4200.25, 4180.07, 4150.5, -12.34]);
    assert.deepEqual(decoded.sampleOffsetsMs, [42, 179, 316, 453]);
    assert.equal(decoded.context.wasteWeight, 120.25);
    assert.equal(decoded.context.litterRemaining, 3805.07);
    assert.equal(decoded.context.daysSinceDeepClean, 12);
    assert.equal(decoded.context.visitsSinceScoop, 4);
    assert.equal(decoded.context.urinationsSinceScoop, 3);
    assert.equal(decoded.context.defecationsSinceScoop, 1);
  });

  it('writes null sentinels for omitted context and per-field nulls', () => {
    const omitted = decodeLitterboxRawData(
      encodeLitterboxRawData({
        version: LITTERBOX_RAW_DATA_VERSION_2,
        startTimeMs,
        weights: [100.5],
        sampleOffsetsMs: [0],
      }),
    );
    assert.ok(omitted);
    assert.deepEqual(omitted.context, {});

    const partial = decodeLitterboxRawData(
      encodeLitterboxRawData({
        version: LITTERBOX_RAW_DATA_VERSION_2,
        startTimeMs,
        context: { wasteWeight: 55.5 },
        weights: [100.5],
        sampleOffsetsMs: [0],
      }),
    );
    assert.ok(partial);
    assert.equal(partial.context.wasteWeight, 55.5);
    assert.equal(partial.context.litterRemaining, undefined);
    assert.equal(partial.context.daysSinceDeepClean, undefined);
    assert.equal(partial.context.visitsSinceScoop, undefined);
    assert.equal(partial.context.urinationsSinceScoop, undefined);
    assert.equal(partial.context.defecationsSinceScoop, undefined);
  });

  it('round-trips a gap longer than 65.535s exactly via the delta escape', () => {
    const offsets = [0, 137, 137 + 90_000, 137 + 90_000 + 137];
    const decoded = decodeLitterboxRawData(
      encodeLitterboxRawData({
        version: LITTERBOX_RAW_DATA_VERSION_2,
        startTimeMs,
        weights: [1, 2, 3, 4],
        sampleOffsetsMs: offsets,
      }),
    );
    assert.ok(decoded);
    assert.deepEqual(decoded.sampleOffsetsMs, offsets);
  });

  it('clamps non-monotonic offsets to zero deltas on encode', () => {
    const decoded = decodeLitterboxRawData(
      encodeLitterboxRawData({
        version: LITTERBOX_RAW_DATA_VERSION_2,
        startTimeMs,
        weights: [1, 2, 3],
        sampleOffsetsMs: [100, 50, 200],
      }),
    );
    assert.ok(decoded);
    // A backwards clock blip clamps to a zero delta without shifting the
    // later samples' absolute offsets.
    assert.deepEqual(decoded.sampleOffsetsMs, [100, 100, 200]);
  });

  it('throws when offsets and weights lengths differ', () => {
    assert.throws(
      () =>
        encodeLitterboxRawData({
          version: LITTERBOX_RAW_DATA_VERSION_2,
          startTimeMs,
          weights: [1, 2],
          sampleOffsetsMs: [0],
        }),
      /sampleOffsetsMs/,
    );
  });

  it('keeps the full weight trace when the timestamp section is truncated', () => {
    const encoded = encodeLitterboxRawData({
      version: LITTERBOX_RAW_DATA_VERSION_2,
      startTimeMs,
      weights: [1, 2, 3, 4],
      sampleOffsetsMs: [0, 137, 274, 411],
    });

    // Cut mid-deltas: keep weights + first two deltas only.
    const midDeltas = decodeLitterboxRawData(
      encoded.subarray(0, 31 + 4 * 4 + 2 * 2),
    );
    assert.ok(midDeltas);
    assert.deepEqual(midDeltas.weights, [1, 2, 3, 4]);
    assert.deepEqual(midDeltas.sampleOffsetsMs, [0, 137]);

    // Cut mid-escape: a >65535ms gap needs 6 bytes; leave only the sentinel.
    const withGap = encodeLitterboxRawData({
      version: LITTERBOX_RAW_DATA_VERSION_2,
      startTimeMs,
      weights: [1, 2],
      sampleOffsetsMs: [0, 90_000],
    });
    const midEscape = decodeLitterboxRawData(
      withGap.subarray(0, 31 + 4 * 2 + 2 + 2),
    );
    assert.ok(midEscape);
    assert.deepEqual(midEscape.weights, [1, 2]);
    assert.deepEqual(midEscape.sampleOffsetsMs, [0]);
  });

  it('decodes a blob truncated mid-weights to the complete weights only', () => {
    const encoded = encodeLitterboxRawData({
      version: LITTERBOX_RAW_DATA_VERSION_2,
      startTimeMs,
      weights: [100.5, 200.25, 300],
      sampleOffsetsMs: [0, 137, 274],
    });

    const decoded = decodeLitterboxRawData(encoded.subarray(0, 31 + 4));
    assert.ok(decoded);
    assert.deepEqual(decoded.weights, [100.5]);
    assert.deepEqual(decoded.sampleOffsetsMs, []);
  });
});
