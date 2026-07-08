import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  encodeLitterboxRawData,
  LITTERBOX_RAW_DATA_VERSION_1,
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

  it('UI decode returns null for malformed wire payloads', () => {
    assert.equal(decodeLitterboxRawData(null), null);
    assert.equal(decodeLitterboxRawData([99]), null);
  });
});
