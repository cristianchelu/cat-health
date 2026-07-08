import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  encodeLitterboxRawData,
  LITTERBOX_RAW_DATA_VERSION_1,
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

  it('returns null for empty wire payloads', () => {
    assert.equal(decodeLitterboxRawData(null), null);
    assert.equal(decodeLitterboxRawData([]), null);
  });
});
