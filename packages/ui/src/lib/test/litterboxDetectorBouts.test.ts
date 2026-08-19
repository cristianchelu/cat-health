import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { deriveDetectorBouts } from '../litterboxDetectorBouts.ts';

describe('deriveDetectorBouts', () => {
  it('maps eliminating periods to bout annotations in seconds', () => {
    const bouts = deriveDetectorBouts(
      [
        { state: 'occupied', start: 0, end: 20 },
        {
          state: 'eliminating',
          start: 20,
          end: 50,
          elimination_type: 'defecation',
        },
      ],
      10,
    );

    assert.deepEqual(bouts, [
      {
        bout_index: 0,
        t_start_s: 2,
        t_end_s: 5,
        bout_type: 'defecation',
      },
    ]);
  });

  it('converts with the true sample rate when the visit carries one', () => {
    const bouts = deriveDetectorBouts(
      [
        {
          state: 'eliminating',
          start: 0,
          end: 73,
          elimination_type: 'urination',
        },
      ],
      7.3,
    );

    assert.deepEqual(bouts, [
      { bout_index: 0, t_start_s: 0, t_end_s: 10, bout_type: 'urination' },
    ]);
  });

  it('skips sub-50ms eliminating periods and unknown elimination types', () => {
    const bouts = deriveDetectorBouts(
      [
        { state: 'eliminating', start: 0, end: 4 },
        { state: 'eliminating', start: 10, end: 30 },
      ],
      100,
    );

    assert.equal(bouts.length, 1);
    assert.equal(bouts[0]?.bout_type, 'unknown');
    assert.equal(bouts[0]?.t_start_s, 0.1);
    assert.equal(bouts[0]?.t_end_s, 0.3);
  });
});
