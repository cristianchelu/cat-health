import type { DeviceType } from 'shared';
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

/**
 * Get the start of the week (Monday) for a given date
 */
export function getWeekStart(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  const dayOfWeek = date.getUTCDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Monday is start of week
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().split('T')[0];
}

/**
 * Get the end of the week (Sunday) for a given date
 */
export function getWeekEnd(dateStr: string): string {
  const weekStart = getWeekStart(dateStr);
  const date = new Date(`${weekStart}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 6);
  return date.toISOString().split('T')[0];
}

/**
 * Get the start of the month for a given date
 */
export function getMonthStart(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  date.setUTCDate(1);
  return date.toISOString().split('T')[0];
}

/**
 * Get the end of the month for a given date
 */
export function getMonthEnd(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + 1, 0); // Last day of current month
  return date.toISOString().split('T')[0];
}

/**
 * Create a date range based on a reference date and range type
 */
export function createDateRange(
  referenceDate: string,
  type: TimeRangeType,
): DateRange {
  switch (type) {
    case 'day':
      return {
        startDate: referenceDate,
        endDate: referenceDate,
        type: 'day',
      };
    case 'week':
      return {
        startDate: getWeekStart(referenceDate),
        endDate: getWeekEnd(referenceDate),
        type: 'week',
      };
    case 'month':
      return {
        startDate: getMonthStart(referenceDate),
        endDate: getMonthEnd(referenceDate),
        type: 'month',
      };
    case 'custom':
      return {
        startDate: referenceDate,
        endDate: referenceDate,
        type: 'custom',
      };
    default:
      return {
        startDate: referenceDate,
        endDate: referenceDate,
        type: 'day',
      };
  }
}

/**
 * Navigate to the previous period based on the current date range
 */
export function getPreviousDateRange(currentRange: DateRange): DateRange {
  const startDate = new Date(`${currentRange.startDate}T00:00:00.000Z`);

  switch (currentRange.type) {
    case 'day':
      startDate.setUTCDate(startDate.getUTCDate() - 1);
      return createDateRange(startDate.toISOString().split('T')[0], 'day');
    case 'week':
      startDate.setUTCDate(startDate.getUTCDate() - 7);
      return createDateRange(startDate.toISOString().split('T')[0], 'week');
    case 'month':
      startDate.setUTCMonth(startDate.getUTCMonth() - 1);
      return createDateRange(startDate.toISOString().split('T')[0], 'month');
    case 'custom': {
      // For custom ranges, move by the same number of days
      const daysDiff =
        Math.floor(
          (new Date(`${currentRange.endDate}T00:00:00.000Z`).getTime() -
            new Date(`${currentRange.startDate}T00:00:00.000Z`).getTime()) /
            (1000 * 60 * 60 * 24),
        ) + 1;
      startDate.setUTCDate(startDate.getUTCDate() - daysDiff);
      const endDate = new Date(startDate);
      endDate.setUTCDate(endDate.getUTCDate() + daysDiff - 1);
      return {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        type: 'custom',
      };
    }
    default:
      return currentRange;
  }
}

/**
 * Navigate to the next period based on the current date range
 */
export function getNextDateRange(currentRange: DateRange): DateRange {
  const startDate = new Date(`${currentRange.startDate}T00:00:00.000Z`);

  switch (currentRange.type) {
    case 'day':
      startDate.setUTCDate(startDate.getUTCDate() + 1);
      return createDateRange(startDate.toISOString().split('T')[0], 'day');
    case 'week':
      startDate.setUTCDate(startDate.getUTCDate() + 7);
      return createDateRange(startDate.toISOString().split('T')[0], 'week');
    case 'month':
      startDate.setUTCMonth(startDate.getUTCMonth() + 1);
      return createDateRange(startDate.toISOString().split('T')[0], 'month');
    case 'custom': {
      // For custom ranges, move by the same number of days
      const daysDiff =
        Math.floor(
          (new Date(`${currentRange.endDate}T00:00:00.000Z`).getTime() -
            new Date(`${currentRange.startDate}T00:00:00.000Z`).getTime()) /
            (1000 * 60 * 60 * 24),
        ) + 1;
      startDate.setUTCDate(startDate.getUTCDate() + daysDiff);
      const endDate = new Date(startDate);
      endDate.setUTCDate(endDate.getUTCDate() + daysDiff - 1);
      return {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        type: 'custom',
      };
    }
    default:
      return currentRange;
  }
}

/**
 * Format a date range for display
 */
export function formatDateRangeForDisplay(dateRange: DateRange): string {
  const startDate = new Date(`${dateRange.startDate}T00:00:00.000Z`);
  const endDate = new Date(`${dateRange.endDate}T00:00:00.000Z`);

  if (dateRange.startDate === dateRange.endDate) {
    return startDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  const startMonth = startDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  const endMonth = endDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  const year = endDate.getFullYear();

  if (dateRange.type === 'week') {
    return `Week of ${startMonth} - ${endMonth}, ${year}`;
  } else if (dateRange.type === 'month') {
    return startDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
    });
  } else {
    return `${startMonth} - ${endMonth}, ${year}`;
  }
}

export const getDeviceTypeLabel = (type: DeviceType) => {
  switch (type) {
    case 'litterbox':
      return 'Litter Box';
    case 'feeder':
      return 'Feeder';
    case 'water_fountain':
      return 'Water Fountain';
  }
};
