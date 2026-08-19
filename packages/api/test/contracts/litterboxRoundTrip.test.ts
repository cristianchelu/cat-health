import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  encodeLitterboxRawData,
  LITTERBOX_RAW_DATA_VERSION_1,
  LITTERBOX_RAW_DATA_VERSION_2,
} from 'shared';

import { decodeLitterboxRawData } from '../../../ui/src/components/events/decodeLitterboxRawData.ts';

function serializeRawData(buffer: Uint8Array): number[] {
  return Array.from(buffer);
}

describe('litterbox raw_data wire round-trip', () => {
  it('shared encode → API number[] serialize → UI decode preserves visit data', () => {
    const startTimeMs = Date.UTC(2026, 2, 15, 8, 30, 0);
    const encoded = encodeLitterboxRawData({
      version: LITTERBOX_RAW_DATA_VERSION_1,
      startTimeMs,
      context: {
        wasteWeight: 90,
        litterRemaining: 500,
        deepCleanTimer: 1,
        totalVisits: 4,
        daysSinceLitterReplaced: 2,
        hoursSinceLastScoop: 6,
      },
      weights: [5000, 4975, 4940, 4905],
    });

    const wire = serializeRawData(encoded);
    const decoded = decodeLitterboxRawData(wire);

    assert.ok(decoded);
    assert.equal(decoded.startTime?.getTime(), startTimeMs);
    assert.deepEqual(decoded.weights, [5000, 4975, 4940, 4905]);
    assert.equal(decoded.context.wasteWeight, 90);
    assert.equal(decoded.context.litterRemaining, 500);
    assert.equal(decoded.context.totalVisits, 4);
  });

  it('v2: shared encode → API number[] serialize → UI decode preserves 0.01g weights and offsets', () => {
    const startTimeMs = Date.UTC(2026, 7, 19, 9, 15, 0);
    const encoded = encodeLitterboxRawData({
      version: LITTERBOX_RAW_DATA_VERSION_2,
      startTimeMs,
      context: {
        wasteWeight: 90.75,
        litterRemaining: 512.5,
        daysSinceDeepClean: 2,
        visitsSinceScoop: 4,
        urinationsSinceScoop: 2,
        defecationsSinceScoop: 2,
      },
      weights: [5000.25, 4975.5, 4940.07, 4905.99],
      sampleOffsetsMs: [0, 137, 274, 90_411],
    });

    const wire = serializeRawData(encoded);
    const decoded = decodeLitterboxRawData(wire);

    assert.ok(decoded);
    assert.equal(decoded.version, 2);
    assert.equal(decoded.startTime?.getTime(), startTimeMs);
    assert.deepEqual(decoded.weights, [5000.25, 4975.5, 4940.07, 4905.99]);
    assert.deepEqual(decoded.sampleOffsetsMs, [0, 137, 274, 90_411]);
    assert.equal(decoded.context.wasteWeight, 90.75);
    assert.equal(decoded.context.litterRemaining, 512.5);
    assert.equal(decoded.context.daysSinceDeepClean, 2);
    assert.equal(decoded.context.visitsSinceScoop, 4);
    assert.equal(decoded.context.urinationsSinceScoop, 2);
    assert.equal(decoded.context.defecationsSinceScoop, 2);
  });

  it('UI decode returns null for malformed wire payloads', () => {
    assert.equal(decodeLitterboxRawData(null), null);
    assert.equal(decodeLitterboxRawData([99]), null);
  });
});
