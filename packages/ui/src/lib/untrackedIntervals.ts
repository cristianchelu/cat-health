import { addDays } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';
import type { UntrackedIntervalDTO } from 'shared';

export function daysToUntrackedIntervals(
  days: Array<{ date: string; tracked: boolean }>,
  timezone: string,
): UntrackedIntervalDTO[] {
  const sorted = days
    .filter((day) => !day.tracked)
    .map((day) => day.date)
    .sort();

  if (sorted.length === 0) {
    return [];
  }

  const intervals: UntrackedIntervalDTO[] = [];
  let currentStart: Date | null = null;
  let currentEnd: Date | null = null;

  for (const date of sorted) {
    const start = fromZonedTime(`${date}T00:00:00`, timezone);
    const end = addDays(start, 1);

    if (currentStart == null) {
      currentStart = start;
      currentEnd = end;
      continue;
    }

    if (start.getTime() === currentEnd!.getTime()) {
      currentEnd = end;
    } else {
      intervals.push({
        start: currentStart.toISOString(),
        end: currentEnd!.toISOString(),
      });
      currentStart = start;
      currentEnd = end;
    }
  }

  if (currentStart != null && currentEnd != null) {
    intervals.push({
      start: currentStart.toISOString(),
      end: currentEnd.toISOString(),
    });
  }

  return intervals;
}
