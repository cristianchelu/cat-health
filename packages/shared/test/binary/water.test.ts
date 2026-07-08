import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  decodeWaterRawData,
  encodeWaterRawData,
  WATER_RAW_DATA_VERSION_1,
} from '../../src/binary/water/index.ts';

describe('water raw_data v1', () => {
  it('round-trips weights, start time, and water level context', () => {
    const startTimeMs = Date.UTC(2026, 3, 1, 14, 30, 0);
    const encoded = encodeWaterRawData({
      version: WATER_RAW_DATA_VERSION_1,
      startTimeMs,
      context: { waterLevel: 72 },
      weights: [1000.12, 999.55, 998.01],
    });

    const decoded = decodeWaterRawData(encoded);

    assert.ok(decoded);
    assert.equal(decoded.version, 1);
    assert.equal(decoded.startTime?.getTime(), startTimeMs);
    assert.equal(decoded.context.waterLevel, 72);
    assert.deepEqual(decoded.weights, [1000.12, 999.55, 998.01]);
  });

  it('writes null sentinel when water level is omitted', () => {
    const encoded = encodeWaterRawData({
      version: WATER_RAW_DATA_VERSION_1,
      startTimeMs: 0,
      weights: [500],
    });

    const decoded = decodeWaterRawData(encoded);
    assert.ok(decoded);
    assert.equal(decoded.context.waterLevel, undefined);
  });

  it('returns null for truncated buffers and unknown versions', () => {
    assert.equal(decodeWaterRawData(new Uint8Array([99])), null);
    assert.equal(decodeWaterRawData(new Uint8Array([1, 0, 0])), null);
  });

  it('decodes only available weights when header count exceeds payload', () => {
    const encoded = encodeWaterRawData({
      version: WATER_RAW_DATA_VERSION_1,
      startTimeMs: 0,
      weights: [100, 200],
    });
    const truncated = encoded.subarray(0, encoded.length - 4);
    const decoded = decodeWaterRawData(truncated);

    assert.ok(decoded);
    assert.deepEqual(decoded.weights, [100]);
  });
});

describe('encodeWaterRawData', () => {
  it('throws for unsupported version', () => {
    assert.throws(
      () =>
        encodeWaterRawData({
          version: 99 as typeof WATER_RAW_DATA_VERSION_1,
          startTimeMs: 0,
          weights: [],
        }),
      /Unsupported water raw_data version/,
    );
  });
});
