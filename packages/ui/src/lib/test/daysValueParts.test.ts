import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { daysValueParts } from '../daysValueParts';

describe('daysValueParts', () => {
  it('reads whole days when at least a day remains', () => {
    assert.deepEqual(daysValueParts(5), { key: 'days_left', count: 5 });
    assert.deepEqual(daysValueParts(3.4), { key: 'days_left', count: 3 });
  });

  it('reads overdue days as a positive count', () => {
    assert.deepEqual(daysValueParts(-2), { key: 'days_overdue', count: 2 });
  });

  it('drops to hours inside a day', () => {
    assert.deepEqual(daysValueParts(0.5), { key: 'hours_left', count: 12 });
    assert.deepEqual(daysValueParts(-0.25), {
      key: 'hours_overdue',
      count: 6,
    });
  });

  it('collapses to due-now when hours would round to zero', () => {
    assert.deepEqual(daysValueParts(0.01), { key: 'due_now', count: 0 });
    assert.deepEqual(daysValueParts(-0.01), { key: 'due_now', count: 0 });
    assert.deepEqual(daysValueParts(0), { key: 'due_now', count: 0 });
  });

  it('keeps exactly one day in days, not 24 hours', () => {
    assert.deepEqual(daysValueParts(1), { key: 'days_left', count: 1 });
    assert.deepEqual(daysValueParts(-1), { key: 'days_overdue', count: 1 });
  });
});
