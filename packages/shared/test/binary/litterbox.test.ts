import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  decodeLitterboxRawData,
  encodeLitterboxRawData,
  LITTERBOX_RAW_DATA_VERSION_1,
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
          version: 2 as 1,
          startTimeMs: 0,
          weights: [],
        }),
      /Unsupported litterbox raw_data version/,
    );
  });
});
