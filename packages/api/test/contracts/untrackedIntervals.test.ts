import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { bucketsToUntrackedIntervals } from '../../src/services/analytics/trendCoverage.ts';
import { daysToUntrackedIntervals } from '../../../ui/src/lib/untrackedIntervals.ts';

const TZ = 'Europe/Bucharest';

describe('untracked interval parity', () => {
  it('merges consecutive untracked days the same way in API and UI', () => {
    const untrackedDays = [
      { date: '2026-06-01', tracked: false },
      { date: '2026-06-02', tracked: false },
      { date: '2026-06-03', tracked: true },
      { date: '2026-06-05', tracked: false },
      { date: '2026-06-06', tracked: false },
    ];

    const fromUi = daysToUntrackedIntervals(untrackedDays, TZ);
    const fromApi = bucketsToUntrackedIntervals(
      new Set(['2026-06-01', '2026-06-02', '2026-06-05', '2026-06-06']),
      'day',
      TZ,
    );

    assert.deepEqual(fromApi, fromUi);
  });

  it('returns an empty list when every day is tracked', () => {
    const fromUi = daysToUntrackedIntervals(
      [
        { date: '2026-06-01', tracked: true },
        { date: '2026-06-02', tracked: true },
      ],
      TZ,
    );
    const fromApi = bucketsToUntrackedIntervals(new Set(), 'day', TZ);

    assert.deepEqual(fromApi, []);
    assert.deepEqual(fromUi, []);
  });
});
