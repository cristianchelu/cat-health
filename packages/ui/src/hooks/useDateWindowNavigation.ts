import * as React from 'react';
import {
  addCalendarDays,
  dateRangeToTimeRange,
  formatCalendarDate,
  parseCalendarDate,
  type DateRange,
  type TimeRangeType,
} from '@/lib/utils';
import { useFormatters } from '@/contexts/RegionalPreferencesProvider';

interface UseDateWindowNavigationOptions {
  days?: number;
  initialEndDate?: Date;
  type?: TimeRangeType;
}

function createWindowRange(
  endDate: Date,
  days: number,
  type: TimeRangeType,
  timezone: string,
): DateRange {
  const endDateStr = formatCalendarDate(endDate, timezone);
  const startDateStr = addCalendarDays(endDateStr, -(days - 1), timezone);
  return {
    startDate: startDateStr,
    endDate: endDateStr,
    type,
  };
}

export function useDateWindowNavigation({
  days = 1,
  initialEndDate = new Date(),
  type = days === 1 ? 'day' : 'custom',
}: UseDateWindowNavigationOptions = {}) {
  const { timezone } = useFormatters();

  const todayRange = React.useMemo(
    () => createWindowRange(new Date(), days, type, timezone),
    [days, type, timezone],
  );
  const [dateRange, setDateRange] = React.useState<DateRange>(() =>
    createWindowRange(initialEndDate, days, type, timezone),
  );

  React.useEffect(() => {
    setDateRange((current) =>
      createWindowRange(
        parseCalendarDate(current.endDate, timezone),
        days,
        type,
        timezone,
      ),
    );
  }, [days, timezone, type]);

  const goToPreviousWindow = React.useCallback(() => {
    setDateRange((current) => {
      const endDateStr = addCalendarDays(current.endDate, -days, timezone);
      return createWindowRange(
        parseCalendarDate(endDateStr, timezone),
        days,
        type,
        timezone,
      );
    });
  }, [days, timezone, type]);

  const goToNextWindow = React.useCallback(() => {
    setDateRange((current) => {
      const endDateStr = addCalendarDays(current.endDate, days, timezone);
      const nextRange = createWindowRange(
        parseCalendarDate(endDateStr, timezone),
        days,
        type,
        timezone,
      );
      return nextRange.endDate > todayRange.endDate ? todayRange : nextRange;
    });
  }, [days, todayRange, timezone, type]);

  const resetToCurrentWindow = React.useCallback(() => {
    setDateRange(todayRange);
  }, [todayRange]);

  const timeRange = React.useMemo(
    () => dateRangeToTimeRange(dateRange, timezone),
    [dateRange, timezone],
  );

  const isCurrentWindow =
    dateRange.startDate === todayRange.startDate &&
    dateRange.endDate === todayRange.endDate;

  return {
    dateRange,
    setDateRange,
    startTime: timeRange.startTime,
    endTime: timeRange.endTime,
    isCurrentWindow,
    goToPreviousWindow,
    goToNextWindow,
    resetToCurrentWindow,
  };
}
