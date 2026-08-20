import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getBoutDurations } from '../litterboxAnalytics.ts';
import type { LitterboxAnalysisStatePeriod } from 'shared';

const segments: LitterboxAnalysisStatePeriod[] = [
  { state: 'occupied', start: 0, end: 100 },
  { state: 'eliminating', start: 100, end: 173, elimination_type: 'urination' },
  { state: 'occupied', start: 173, end: 200 },
  {
    state: 'eliminating',
    start: 200,
    end: 273,
    elimination_type: 'defecation',
  },
];

describe('getBoutDurations', () => {
  it('converts segment sample indices with the visit sample rate', () => {
    // 73 samples at 7.3Hz is 10s; at the legacy 10Hz assumption it would
    // wrongly read as 7.3s (~27% short).
    const durations = getBoutDurations(segments, 7.3);
    assert.equal(durations?.urination, 10);
    assert.equal(durations?.defecation, 10);
  });

  it('falls back to the legacy rate when the caller passes 10', () => {
    const durations = getBoutDurations(segments, 10);
    assert.equal(durations?.urination, 7.3);
    assert.equal(durations?.defecation, 7.3);
  });

  it('returns undefined without eliminating segments', () => {
    assert.equal(getBoutDurations(null, 7.3), undefined);
    assert.equal(getBoutDurations([], 7.3), undefined);
    assert.equal(
      getBoutDurations([{ state: 'occupied', start: 0, end: 50 }], 7.3),
      undefined,
    );
  });
});
