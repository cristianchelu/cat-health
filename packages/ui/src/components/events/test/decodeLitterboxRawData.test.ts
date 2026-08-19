import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  encodeLitterboxRawData,
  LITTERBOX_RAW_DATA_VERSION_1,
  LITTERBOX_RAW_DATA_VERSION_2,
} from 'shared';

import { decodeLitterboxRawData } from '../decodeLitterboxRawData.ts';

describe('decodeLitterboxRawData', () => {
  it('decodes API wire-format number[] via shared binary codec', () => {
    const encoded = encodeLitterboxRawData({
      version: LITTERBOX_RAW_DATA_VERSION_1,
      startTimeMs: Date.UTC(2026, 0, 10, 8, 0, 0),
      weights: [4100, 4080, 4050],
    });

    const decoded = decodeLitterboxRawData(Array.from(encoded));

    assert.ok(decoded);
    assert.deepEqual(decoded.weights, [4100, 4080, 4050]);
  });

  it('decodes v2 wire payloads with 0.01g weights and sample offsets', () => {
    const encoded = encodeLitterboxRawData({
      version: LITTERBOX_RAW_DATA_VERSION_2,
      startTimeMs: Date.UTC(2026, 7, 19, 8, 0, 0),
      weights: [4100.25, 4080.07],
      sampleOffsetsMs: [0, 137],
    });

    const decoded = decodeLitterboxRawData(Array.from(encoded));

    assert.ok(decoded);
    assert.equal(decoded.version, 2);
    assert.deepEqual(decoded.weights, [4100.25, 4080.07]);
    assert.deepEqual(decoded.sampleOffsetsMs, [0, 137]);
  });

  it('returns null for empty wire payloads', () => {
    assert.equal(decodeLitterboxRawData(null), null);
    assert.equal(decodeLitterboxRawData([]), null);
  });
});
