import * as React from 'react';
import { format, getDate, isSameDay, startOfWeek, type Locale } from 'date-fns';
import type {
  LitterboxTrendsResponseDTO,
  LitterboxUseEliminationType,
} from 'shared';
import LitterboxDotGrid, {
  type LitterboxDotGridColumn,
  type LitterboxDotGridColumnFooterVariant,
  type LitterboxDotGridDot,
} from './LitterboxDotGrid';
import { parseCalendarDate } from '@/lib/utils';
import { useFormatters } from '@/contexts/RegionalPreferencesProvider';

type DotType = LitterboxDotGridDot['type'];

const DOT_PRIORITY: Record<DotType, number> = {
  unknown: 0,
  defecation: 1,
  urination: 2,
  no_elimination: 3,
};

function getColumnFooterLabel(
  date: Date,
  locale: Locale,
): { text: string; variant: LitterboxDotGridColumnFooterVariant } {
  if (getDate(date) === 1) {
    return {
      text: format(date, 'MMM', { locale }).toUpperCase(),
      variant: 'month',
    };
  }

  if (isSameDay(date, startOfWeek(date, { locale }))) {
    return {
      text: format(date, 'd'),
      variant: 'date',
    };
  }

  return {
    text: format(date, 'EEEEE', { locale }),
    variant: 'dow',
  };
}

function toDots(event: {
  type: LitterboxUseEliminationType;
  straining?: boolean;
}): LitterboxDotGridDot[] {
  if (event.type === 'both') {
    return [
      { type: 'urination', straining: event.straining },
      { type: 'defecation', straining: event.straining },
    ];
  }

  return [{ type: event.type, straining: event.straining }];
}

function createLitterboxDotColumns(
  days: LitterboxTrendsResponseDTO['days'],
  showColumnLabels: boolean,
  locale: Locale,
  timezone: string,
  formatDateLabel: (date: Date, style?: 'short' | 'medium') => string,
): LitterboxDotGridColumn[] {
  return days.map((day) => {
    const dots = day.events.flatMap(toDots);
    dots.sort((a, b) => DOT_PRIORITY[a.type] - DOT_PRIORITY[b.type]);
    const date = parseCalendarDate(day.date, timezone);

    return {
      key: day.date,
      label: `${formatDateLabel(date, 'medium')}: ${dots.length} visits`,
      dots,
      tracked: day.tracked,
      ...(showColumnLabels
        ? { footer: getColumnFooterLabel(date, locale) }
        : {}),
    };
  });
}

interface LitterboxTrendGridProps extends Omit<
  React.ComponentProps<typeof LitterboxDotGrid>,
  'columns'
> {
  days: LitterboxTrendsResponseDTO['days'];
  showColumnLabels?: boolean;
  locale?: Locale;
}

const LitterboxTrendGrid = React.forwardRef<
  HTMLDivElement,
  LitterboxTrendGridProps
>(({ days, showColumnLabels = false, locale: localeProp, ...props }, ref) => {
  const { dateFnsLocale, formatDate, timezone } = useFormatters();
  const locale = localeProp ?? dateFnsLocale;
  const columns = React.useMemo(
    () =>
      createLitterboxDotColumns(
        days,
        showColumnLabels,
        locale,
        timezone,
        (date, style) => formatDate(date, style ?? 'medium'),
      ),
    [days, formatDate, locale, showColumnLabels, timezone],
  );
  return <LitterboxDotGrid ref={ref} columns={columns} {...props} />;
});

LitterboxTrendGrid.displayName = 'LitterboxTrendGrid';

export { type LitterboxTrendGridProps };
export default LitterboxTrendGrid;
