import { clsx } from 'clsx';
import { addDays, format } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

export const cn = clsx;

export const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

export const getStringValue = (
  record: Record<string, unknown>,
  key: string,
): string | undefined => {
  const value = record[key];

  return typeof value === 'string' ? value : undefined;
};

export type TimeRangeType = 'day' | 'week' | 'month' | 'custom';

export interface DateRange {
  startDate: string; // YYYY-MM-DD format
  endDate: string; // YYYY-MM-DD format
  type: TimeRangeType;
}

/**
 * Create a DateRange for a single local calendar day. Defaults to today.
 * Always use this instead of new Date().toISOString().split('T')[0] to avoid UTC date drift.
 */
export function createDayRange(
  date: Date = new Date(),
  timezone?: string,
): DateRange {
  const dateStr = timezone
    ? formatCalendarDate(date, timezone)
    : format(date, 'yyyy-MM-dd');
  return { startDate: dateStr, endDate: dateStr, type: 'day' };
}

/**
 * Format an instant as YYYY-MM-DD in the given IANA timezone.
 */
export function formatCalendarDate(date: Date, timezone: string): string {
  return formatInTimeZone(date, timezone, 'yyyy-MM-dd');
}

/**
 * Parse a calendar date string as noon in the given timezone (avoids DST edge cases).
 */
export function parseCalendarDate(dateStr: string, timezone: string): Date {
  return fromZonedTime(`${dateStr}T12:00:00.000`, timezone);
}

export function addCalendarDays(
  dateStr: string,
  deltaDays: number,
  timezone: string,
): string {
  const base = parseCalendarDate(dateStr, timezone);
  return formatCalendarDate(addDays(base, deltaDays), timezone);
}

/**
 * Convert a date string (YYYY-MM-DD) to start and end ISO timestamp strings for that day
 * in the user's local timezone
 * @param dateStr Date string in YYYY-MM-DD format
 * @returns Object with startTime and endTime ISO strings
 */
export function dateToTimeRange(
  dateStr: string,
  timezone: string,
): {
  startTime: string;
  endTime: string;
} {
  const startOfDay = fromZonedTime(`${dateStr}T00:00:00.000`, timezone);
  const endOfDay = fromZonedTime(`${dateStr}T23:59:59.999`, timezone);

  return {
    startTime: startOfDay.toISOString(),
    endTime: endOfDay.toISOString(),
  };
}

/**
 * Convert a date range to start and end ISO timestamp strings
 * in the configured timezone
 */
export function dateRangeToTimeRange(
  dateRange: DateRange,
  timezone: string,
): {
  startTime: string;
  endTime: string;
} {
  const startOfDay = fromZonedTime(
    `${dateRange.startDate}T00:00:00.000`,
    timezone,
  );
  const endOfDay = fromZonedTime(`${dateRange.endDate}T23:59:59.999`, timezone);

  return {
    startTime: startOfDay.toISOString(),
    endTime: endOfDay.toISOString(),
  };
}
