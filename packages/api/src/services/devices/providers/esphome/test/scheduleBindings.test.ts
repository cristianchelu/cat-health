import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEEP_CLEAN_BINDINGS,
  readSchedule,
  waterScheduleContract,
  type ScheduleSensorReader,
} from '../scheduleBindings.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW_MS = 1_787_300_000_000;

/** A device as (objectId → [value, unit]); listed-but-silent uses null. */
function reader(
  sensors: Record<string, [number | null, string?]>,
): ScheduleSensorReader {
  return {
    has: (id) => id in sensors,
    number: (id) => sensors[id]?.[0] ?? null,
    unit: (id) => sensors[id]?.[1],
  };
}

const contract = waterScheduleContract();

describe('readSchedule', () => {
  it('reads a due timestamp in epoch seconds, with a day-unit interval', () => {
    // The fountain shape: Water Change Due + Water Change Interval.
    const dueMs = NOW_MS + DAY_MS;
    const schedule = readSchedule(
      contract.waterFreshness,
      reader({
        water_change_due: [dueMs / 1000],
        water_change_interval: [5, 'd'],
      }),
      NOW_MS,
    );
    assert.ok(schedule);
    assert.ok(Math.abs(schedule.daysRemaining - 1) < 1e-9);
    assert.equal(schedule.intervalDays, 5);
  });

  it('tolerates a due timestamp already in milliseconds', () => {
    const schedule = readSchedule(
      contract.waterFreshness,
      reader({ water_change_due: [NOW_MS + 12 * 60 * 60 * 1000] }),
      NOW_MS,
    );
    assert.ok(schedule);
    assert.ok(Math.abs(schedule.daysRemaining - 0.5) < 1e-9);
    assert.equal(schedule.intervalDays, undefined);
  });

  it('derives due from last-changed plus an hour-unit interval', () => {
    // The bowl shape: Water Last Changed + Water Reminder Interval (12 h).
    const lastChangedMs = NOW_MS - 18 * 60 * 60 * 1000;
    const schedule = readSchedule(
      contract.waterFreshness,
      reader({
        water_last_changed: [lastChangedMs / 1000],
        water_reminder_interval: [12, 'h'],
      }),
      NOW_MS,
    );
    assert.ok(schedule);
    // Changed 18h ago on a 12h cycle: 6 hours overdue.
    assert.ok(Math.abs(schedule.daysRemaining - -0.25) < 1e-9);
    assert.equal(schedule.intervalDays, 0.5);
  });

  it('reads a bare countdown, defaulting an undeclared unit to days', () => {
    const schedule = readSchedule(
      contract.waterFreshness,
      reader({ water_days_remaining: [3] }),
      NOW_MS,
    );
    assert.ok(schedule);
    assert.equal(schedule.daysRemaining, 3);
    assert.equal(schedule.intervalDays, undefined);
  });

  it('prefers the due shape when a firmware exposes several', () => {
    const schedule = readSchedule(
      contract.waterFreshness,
      reader({
        water_change_due: [(NOW_MS + 2 * DAY_MS) / 1000],
        water_days_remaining: [9],
        water_change_interval: [5],
      }),
      NOW_MS,
    );
    assert.ok(schedule);
    assert.ok(Math.abs(schedule.daysRemaining - 2) < 1e-9);
  });

  it('returns null while the chosen shape has not published', () => {
    // Listed entities pick the shape; silence must not fall through to a
    // lesser shape that happens to have spoken.
    const schedule = readSchedule(
      contract.waterFreshness,
      reader({
        water_change_due: [null],
        water_days_remaining: [4],
      }),
      NOW_MS,
    );
    assert.equal(schedule, null);
  });

  it('returns null when no shape is listed at all', () => {
    const schedule = readSchedule(
      contract.filterLife,
      reader({ water_level: [80] }),
      NOW_MS,
    );
    assert.equal(schedule, null);
  });

  it('reads the deep clean schedule, preferring due over the legacy countdown', () => {
    const schedule = readSchedule(
      DEEP_CLEAN_BINDINGS,
      reader({
        deep_clean_due: [(NOW_MS + 12 * DAY_MS) / 1000],
        deep_clean_timer: [3, 'd'],
        litter_change_interval: [30, 'd'],
      }),
      NOW_MS,
    );
    assert.ok(schedule);
    assert.ok(Math.abs(schedule.daysRemaining - 12) < 1e-9);
    assert.equal(schedule.intervalDays, 30);
  });

  it('falls back to the legacy deep_clean_timer countdown on unflashed boxes', () => {
    const schedule = readSchedule(
      DEEP_CLEAN_BINDINGS,
      reader({
        deep_clean_timer: [3, 'd'],
        litter_change_interval: [30, 'd'],
      }),
      NOW_MS,
    );
    assert.ok(schedule);
    assert.equal(schedule.daysRemaining, 3);
    assert.equal(schedule.intervalDays, 30);
  });

  it('reads the filter schedule from due + interval', () => {
    const schedule = readSchedule(
      contract.filterLife,
      reader({
        filter_change_due: [(NOW_MS + 5 * DAY_MS) / 1000],
        filter_change_interval: [14, 'd'],
      }),
      NOW_MS,
    );
    assert.ok(schedule);
    assert.ok(Math.abs(schedule.daysRemaining - 5) < 1e-9);
    assert.equal(schedule.intervalDays, 14);
  });
});
