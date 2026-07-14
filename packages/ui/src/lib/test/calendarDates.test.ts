import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addCalendarDays,
  formatCalendarDate,
  parseCalendarDate,
} from '../utils.ts';

describe('calendar date helpers', () => {
  it('formats and parses calendar dates in a timezone', () => {
    const instant = new Date('2024-07-15T22:00:00.000Z');
    const dateStr = formatCalendarDate(instant, 'Europe/Bucharest');
    assert.equal(dateStr, '2024-07-16');

    const parsed = parseCalendarDate('2024-07-16', 'Europe/Bucharest');
    assert.equal(formatCalendarDate(parsed, 'Europe/Bucharest'), '2024-07-16');
  });

  it('adds calendar days within a timezone', () => {
    assert.equal(
      addCalendarDays('2024-07-14', 1, 'Europe/Bucharest'),
      '2024-07-15',
    );
    assert.equal(
      addCalendarDays('2024-07-14', -1, 'Europe/Bucharest'),
      '2024-07-13',
    );
  });
});
