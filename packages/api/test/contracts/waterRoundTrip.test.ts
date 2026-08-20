import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { encodeWaterRawData, WATER_RAW_DATA_VERSION_1 } from 'shared';

import { decodeWaterRawData } from '../../../ui/src/components/events/decodeWaterRawData.ts';

describe('water raw_data wire round-trip', () => {
  it('shared encode → API number[] serialize → UI decode preserves visit data', () => {
    const startTimeMs = Date.UTC(2026, 4, 10, 9, 15, 0);
    const encoded = encodeWaterRawData({
      version: WATER_RAW_DATA_VERSION_1,
      startTimeMs,
      context: { waterLevel: 55 },
      weights: [1000, 998.5, 996.25],
    });

    const wire = Array.from(encoded);
    const decoded = decodeWaterRawData(wire);

    assert.ok(decoded);
    assert.equal(decoded.startTime?.getTime(), startTimeMs);
    assert.equal(decoded.context.waterLevel, 55);
    assert.deepEqual(decoded.weights, [1000, 998.5, 996.25]);
  });

  it('UI decode returns null for malformed wire payloads', () => {
    assert.equal(decodeWaterRawData(null), null);
    assert.equal(decodeWaterRawData([99]), null);
  });
});
