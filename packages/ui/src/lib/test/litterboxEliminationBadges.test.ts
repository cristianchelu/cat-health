import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { eliminationBadgeRowsFromSegments } from '../litterboxEliminationBadges.ts';

describe('eliminationBadgeRowsFromSegments', () => {
  it('maps eliminating segments to second-based badge rows', () => {
    const rows = eliminationBadgeRowsFromSegments(
      [
        { state: 'entering', start: 0, end: 10 },
        {
          state: 'eliminating',
          start: 10,
          end: 30,
          elimination_type: 'urination',
        },
        { state: 'exiting', start: 30, end: 40 },
      ],
      10,
    );

    assert.deepEqual(rows, [
      { elimination_type: 'urination', start_s: 1, end_s: 3 },
    ]);
  });

  it('returns an empty list for missing or non-eliminating periods', () => {
    assert.deepEqual(eliminationBadgeRowsFromSegments(null, 10), []);
    assert.deepEqual(
      eliminationBadgeRowsFromSegments(
        [{ state: 'scratching', start: 0, end: 20 }],
        10,
      ),
      [],
    );
  });
});
