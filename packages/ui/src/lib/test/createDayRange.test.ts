import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'date-fns';

import { createDayRange } from '../../lib/utils.ts';

describe('createDayRange', () => {
  it('formats the local calendar day, not UTC from toISOString', () => {
    const date = new Date(2026, 5, 1, 1, 0, 0);
    const range = createDayRange(date);

    assert.equal(range.startDate, format(date, 'yyyy-MM-dd'));
    assert.equal(range.endDate, range.startDate);
    assert.equal(range.type, 'day');

    const utcSplit = date.toISOString().split('T')[0];
    if (utcSplit !== range.startDate) {
      assert.notEqual(range.startDate, utcSplit);
    }
  });
});
