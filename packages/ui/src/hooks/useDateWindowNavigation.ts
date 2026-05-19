import * as React from 'react';
import { addDays, format, parseISO, subDays } from 'date-fns';
import {
  dateRangeToTimeRange,
  type DateRange,
  type TimeRangeType,
} from '@/lib/utils';

interface UseDateWindowNavigationOptions {
  days?: number;
  initialEndDate?: Date;
  type?: TimeRangeType;
}

function createWindowRange(
  endDate: Date,
  days: number,
  type: TimeRangeType,
): DateRange {
  const startDate = subDays(endDate, days - 1);
  return {
    startDate: format(startDate, 'yyyy-MM-dd'),
    endDate: format(endDate, 'yyyy-MM-dd'),
    type,
  };
}

export function useDateWindowNavigation({
  days = 1,
  initialEndDate = new Date(),
  type = days === 1 ? 'day' : 'custom',
}: UseDateWindowNavigationOptions = {}) {
  const todayRange = React.useMemo(
    () => createWindowRange(new Date(), days, type),
    [days, type],
  );
  const [dateRange, setDateRange] = React.useState<DateRange>(() =>
    createWindowRange(initialEndDate, days, type),
  );

  const goToPreviousWindow = React.useCallback(() => {
    setDateRange((current) => {
      const endDate = subDays(parseISO(current.endDate), days);
      return createWindowRange(endDate, days, type);
    });
  }, [days, type]);

  const goToNextWindow = React.useCallback(() => {
    setDateRange((current) => {
      const endDate = addDays(parseISO(current.endDate), days);
      const nextRange = createWindowRange(endDate, days, type);
      return nextRange.endDate > todayRange.endDate ? todayRange : nextRange;
    });
  }, [days, todayRange, type]);

  const resetToCurrentWindow = React.useCallback(() => {
    setDateRange(todayRange);
  }, [todayRange]);

  const timeRange = React.useMemo(
    () => dateRangeToTimeRange(dateRange),
    [dateRange],
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
