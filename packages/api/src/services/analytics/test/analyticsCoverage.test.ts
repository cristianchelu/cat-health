import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ceilToBucket,
  floorToBucket,
  formatBucketKey,
  isBucketTracked,
  mergeUntrackedIntervals,
  pairTransitionEvents,
  snapIntervalsToBuckets,
  type TimeInterval,
  type TimeRange,
} from '../analyticsCoverage.ts';

const TZ = 'Europe/Bucharest';

function at(iso: string): Date {
  return new Date(iso);
}

function range(startIso: string, endIso: string): TimeRange {
  return { start: at(startIso), end: at(endIso) };
}

describe('pairTransitionEvents', () => {
  it('pairs pet away/home transitions with no minimum duration', () => {
    const intervals = pairTransitionEvents(
      [
        { timestamp: at('2026-06-01T14:58:00+03:00'), state: 'away' },
        { timestamp: at('2026-06-02T10:00:00+03:00'), state: 'home' },
      ],
      {
        startStates: new Set(['away', 'outside']),
        endStates: new Set(['home']),
        range: range('2026-06-01T00:00:00+03:00', '2026-06-03T00:00:00+03:00'),
      },
    );

    assert.equal(intervals.length, 1);
    assert.equal(intervals[0].start.toISOString(), at('2026-06-01T14:58:00+03:00').toISOString());
    assert.equal(intervals[0].end.toISOString(), at('2026-06-02T10:00:00+03:00').toISOString());
  });

  it('keeps short device outages below threshold out of untracked intervals', () => {
    const intervals = pairTransitionEvents(
      [
        { timestamp: at('2026-06-01T10:00:00Z'), state: 'offline' },
        { timestamp: at('2026-06-01T11:00:00Z'), state: 'online' },
      ],
      {
        startStates: new Set(['offline', 'error']),
        endStates: new Set(['online']),
        range: range('2026-06-01T00:00:00Z', '2026-06-02T00:00:00Z'),
        minDurationMs: 6 * 60 * 60_000,
      },
    );

    assert.deepEqual(intervals, []);
  });

  it('includes device outages at or above threshold', () => {
    const intervals = pairTransitionEvents(
      [
        { timestamp: at('2026-06-01T08:00:00Z'), state: 'offline' },
        { timestamp: at('2026-06-01T15:00:00Z'), state: 'online' },
      ],
      {
        startStates: new Set(['offline', 'error']),
        endStates: new Set(['online']),
        range: range('2026-06-01T00:00:00Z', '2026-06-02T00:00:00Z'),
        minDurationMs: 6 * 60 * 60_000,
      },
    );

    assert.equal(intervals.length, 1);
    assert.equal(intervals[0].start.toISOString(), at('2026-06-01T08:00:00Z').toISOString());
    assert.equal(intervals[0].end.toISOString(), at('2026-06-01T15:00:00Z').toISOString());
  });

  it('closes open-ended away/outage intervals at range end', () => {
    const awayIntervals = pairTransitionEvents(
      [{ timestamp: at('2026-06-01T18:00:00Z'), state: 'away' }],
      {
        startStates: new Set(['away', 'outside']),
        endStates: new Set(['home']),
        range: range('2026-06-01T00:00:00Z', '2026-06-02T00:00:00Z'),
      },
    );

    assert.equal(awayIntervals.length, 1);
    assert.equal(awayIntervals[0].end.toISOString(), at('2026-06-02T00:00:00Z').toISOString());

    const outageIntervals = pairTransitionEvents(
      [{ timestamp: at('2026-06-01T12:00:00Z'), state: 'offline' }],
      {
        startStates: new Set(['offline', 'error']),
        endStates: new Set(['online']),
        range: range('2026-06-01T00:00:00Z', '2026-06-02T00:00:00Z'),
        minDurationMs: 60_000,
      },
    );

    assert.equal(outageIntervals.length, 1);
    assert.equal(outageIntervals[0].end.toISOString(), at('2026-06-02T00:00:00Z').toISOString());
  });
});

describe('mergeUntrackedIntervals', () => {
  it('merges overlapping pet and device intervals', () => {
    const pet: TimeInterval[] = [
      {
        start: at('2026-06-01T08:00:00Z'),
        end: at('2026-06-01T14:00:00Z'),
      },
    ];
    const device: TimeInterval[] = [
      {
        start: at('2026-06-01T12:00:00Z'),
        end: at('2026-06-01T18:00:00Z'),
      },
    ];

    const merged = mergeUntrackedIntervals(pet, device);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].start.toISOString(), at('2026-06-01T08:00:00Z').toISOString());
    assert.equal(merged[0].end.toISOString(), at('2026-06-01T18:00:00Z').toISOString());
  });
});

describe('snapIntervalsToBuckets', () => {
  it('hashes daily and hourly buckets for away-from-14:58 until next-day return', () => {
    const intervals: TimeInterval[] = [
      {
        start: at('2026-06-01T14:58:00+03:00'),
        end: at('2026-06-02T10:00:00+03:00'),
      },
    ];

    const daily = snapIntervalsToBuckets(intervals, 'day', TZ);
    assert.deepEqual([...daily].sort(), ['2026-06-01', '2026-06-02']);

    const hourly = snapIntervalsToBuckets(intervals, 'hour', TZ);
    const hourlyKeys = [...hourly].sort();
    assert.ok(hourlyKeys.includes("2026-06-01T14:00:00"));
    assert.ok(hourlyKeys.includes("2026-06-01T23:00:00"));
    assert.ok(hourlyKeys.includes("2026-06-02T09:00:00"));
    assert.ok(!hourlyKeys.includes("2026-06-02T10:00:00"));
  });

  it('floors and ceils bucket boundaries consistently', () => {
    const date = at('2026-06-01T14:58:00+03:00');
    const floored = floorToBucket(date, 'hour', TZ);
    const ceiled = ceilToBucket(at('2026-06-02T10:00:00+03:00'), 'hour', TZ);

    assert.equal(formatBucketKey(floored, 'hour', TZ), "2026-06-01T14:00:00");
    assert.equal(ceiled.toISOString(), at('2026-06-02T10:00:00+03:00').toISOString());
  });

  it('reports tracked vs untracked buckets via isBucketTracked', () => {
    const untracked = snapIntervalsToBuckets(
      [
        {
          start: at('2026-06-01T14:58:00+03:00'),
          end: at('2026-06-02T10:00:00+03:00'),
        },
      ],
      'day',
      TZ,
    );

    assert.equal(isBucketTracked('2026-06-01', untracked), false);
    assert.equal(isBucketTracked('2026-06-02', untracked), false);
    assert.equal(isBucketTracked('2026-05-31', untracked), true);
  });
});
