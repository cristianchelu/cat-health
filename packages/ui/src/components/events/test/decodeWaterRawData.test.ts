import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  encodeWaterRawData,
  WATER_RAW_DATA_VERSION_1,
} from 'shared';

import { decodeWaterRawData } from '../decodeWaterRawData.ts';

describe('decodeWaterRawData', () => {
  it('decodes API wire-format number[] via shared binary codec', () => {
    const encoded = encodeWaterRawData({
      version: WATER_RAW_DATA_VERSION_1,
      startTimeMs: Date.UTC(2026, 0, 10, 8, 0, 0),
      context: { waterLevel: 40 },
      weights: [1000, 999, 997],
    });

    const decoded = decodeWaterRawData(Array.from(encoded));

    assert.ok(decoded);
    assert.equal(decoded.context.waterLevel, 40);
    assert.deepEqual(decoded.weights, [1000, 999, 997]);
  });

  it('returns null for empty wire payloads', () => {
    assert.equal(decodeWaterRawData(null), null);
    assert.equal(decodeWaterRawData([]), null);
  });
});
