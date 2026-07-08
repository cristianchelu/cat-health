import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { daysToUntrackedIntervals } from '../untrackedIntervals.ts';

describe('daysToUntrackedIntervals', () => {
  it('merges consecutive untracked calendar days', () => {
    const intervals = daysToUntrackedIntervals(
      [
        { date: '2026-06-01', tracked: false },
        { date: '2026-06-02', tracked: false },
        { date: '2026-06-03', tracked: true },
        { date: '2026-06-05', tracked: false },
      ],
      'UTC',
    );

    assert.deepEqual(intervals, [
      { start: '2026-06-01T00:00:00.000Z', end: '2026-06-03T00:00:00.000Z' },
      { start: '2026-06-05T00:00:00.000Z', end: '2026-06-06T00:00:00.000Z' },
    ]);
  });

  it('returns an empty list when every day is tracked', () => {
    assert.deepEqual(
      daysToUntrackedIntervals(
        [{ date: '2026-06-01', tracked: true }],
        'Europe/Bucharest',
      ),
      [],
    );
  });
});
