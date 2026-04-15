import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { StatePeriod } from '../StateAnalyzer.ts';
import { persistedLitterboxSegments } from '../persistedLitterboxSegments.ts';

test('persistedLitterboxSegments sets elimination_type on eliminating periods with variance', () => {
  const periods: StatePeriod[] = [
    { state: 'occupied', start: 0, end: 50 },
    { state: 'eliminating', start: 50, end: 120, variance: 2 },
  ];
  const rows = persistedLitterboxSegments(periods);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[1], {
    state: 'eliminating',
    start: 50,
    end: 120,
    elimination_type: 'urination',
  });
});

test('persistedLitterboxSegments omits elimination_type when eliminating has no variance', () => {
  const periods: StatePeriod[] = [{ state: 'eliminating', start: 0, end: 10 }];
  const rows = persistedLitterboxSegments(periods);
  assert.equal(rows[0].elimination_type, undefined);
});

test('persistedLitterboxSegments maps two eliminating variances to urination and defecation', () => {
  const periods: StatePeriod[] = [
    { state: 'eliminating', start: 0, end: 50, variance: 2 },
    { state: 'eliminating', start: 100, end: 200, variance: 8 },
  ];
  const rows = persistedLitterboxSegments(periods);
  assert.equal(rows[0].elimination_type, 'urination');
  assert.equal(rows[1].elimination_type, 'defecation');
  assert.ok(!('variance' in rows[0]));
});
