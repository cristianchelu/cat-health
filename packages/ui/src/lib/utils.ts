import { clsx } from 'clsx';

export const cn = clsx;

export type TimeRangeType = 'day' | 'week' | 'month' | 'custom';

export interface DateRange {
  startDate: string; // YYYY-MM-DD format
  endDate: string; // YYYY-MM-DD format
  type: TimeRangeType;
}

/**
 * Convert a date string (YYYY-MM-DD) to start and end ISO timestamp strings for that day
 * @param dateStr Date string in YYYY-MM-DD format
 * @returns Object with startTime and endTime ISO strings
 */
export function dateToTimeRange(dateStr: string): {
  startTime: string;
  endTime: string;
} {
  // Create date objects for the start and end of the day in UTC
  const startOfDay = new Date(`${dateStr}T00:00:00.000Z`);
  const endOfDay = new Date(`${dateStr}T23:59:59.999Z`);

  return {
    startTime: startOfDay.toISOString(),
    endTime: endOfDay.toISOString(),
  };
}

/**
 * Convert a date range to start and end ISO timestamp strings
 * @param dateRange DateRange object with startDate and endDate
 * @returns Object with startTime and endTime ISO strings
 */
export function dateRangeToTimeRange(dateRange: DateRange): {
  startTime: string;
  endTime: string;
} {
  const startOfDay = new Date(`${dateRange.startDate}T00:00:00.000Z`);
  const endOfDay = new Date(`${dateRange.endDate}T23:59:59.999Z`);

  return {
    startTime: startOfDay.toISOString(),
    endTime: endOfDay.toISOString(),
  };
}
