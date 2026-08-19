import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { deriveLitterboxSampleRateHz } from '../../src/binary/litterbox/index.ts';
import type { DecodedLitterboxRawData } from '../../src/binary/litterbox/index.ts';

function decoded(
  weights: number[],
  sampleOffsetsMs?: number[],
): DecodedLitterboxRawData {
  return {
    version: sampleOffsetsMs ? 2 : 1,
    startTime: null,
    context: {},
    weights,
    sampleOffsetsMs,
  };
}

describe('deriveLitterboxSampleRateHz', () => {
  it('derives the true rate from v2 sample offsets', () => {
    // 4 samples spanning 411ms -> 3 intervals / 0.411s ≈ 7.299Hz
    const rate = deriveLitterboxSampleRateHz(decoded([1, 2, 3, 4], [0, 137, 274, 411]));
    assert.equal(rate, 7.299);
  });

  it('prefers offsets over the duration fallback', () => {
    const rate = deriveLitterboxSampleRateHz(
      decoded([1, 2, 3, 4], [0, 137, 274, 411]),
      100,
    );
    assert.equal(rate, 7.299);
  });

  it('falls back to duration-derived rate for v1 blobs', () => {
    // 74 samples over 10s -> 7.3Hz
    const rate = deriveLitterboxSampleRateHz(
      decoded(new Array(74).fill(0)),
      10,
    );
    assert.equal(rate, 7.3);
  });

  it('falls back to the legacy 10Hz constant when nothing is derivable', () => {
    assert.equal(deriveLitterboxSampleRateHz(null), 10);
    assert.equal(deriveLitterboxSampleRateHz(decoded([1])), 10);
    assert.equal(deriveLitterboxSampleRateHz(decoded([1, 2]), 0), 10);
    assert.equal(deriveLitterboxSampleRateHz(decoded([1, 2]), -5), 10);
    // Zero-span offsets are degenerate; fall through to duration, then legacy.
    assert.equal(deriveLitterboxSampleRateHz(decoded([1, 2], [50, 50])), 10);
    assert.equal(deriveLitterboxSampleRateHz(decoded([1, 2], [50, 50]), 4), 0.25);
    // A single offset can't span; duration fallback still applies.
    assert.equal(deriveLitterboxSampleRateHz(decoded([1, 2], [0]), 4), 0.25);
  });

  it('rounds to 3 decimals', () => {
    const rate = deriveLitterboxSampleRateHz(decoded([1, 2, 3], [0, 150, 301]));
    assert.equal(rate, 6.645);
  });
});
