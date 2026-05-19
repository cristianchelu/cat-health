import * as React from 'react';
import { format, parseISO } from 'date-fns';
import type {
  LitterboxTrendsResponseDTO,
  LitterboxUseEliminationType,
} from 'shared';
import LitterboxDotGrid, {
  type LitterboxDotGridColumn,
  type LitterboxDotGridDot,
} from './LitterboxDotGrid';

type DotType = LitterboxDotGridDot['type'];

const DOT_PRIORITY: Record<DotType, number> = {
  unknown: 0,
  defecation: 1,
  urination: 2,
  no_elimination: 3,
};

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
): LitterboxDotGridColumn[] {
  return days.map((day) => {
    const dots = day.events.flatMap(toDots);
    dots.sort((a, b) => DOT_PRIORITY[a.type] - DOT_PRIORITY[b.type]);

    return {
      key: day.date,
      label: `${format(parseISO(day.date), 'MMM d')}: ${dots.length} visits`,
      dots,
    };
  });
}

interface LitterboxTrendGridProps
  extends Omit<React.ComponentProps<typeof LitterboxDotGrid>, 'columns'> {
  days: LitterboxTrendsResponseDTO['days'];
}

const LitterboxTrendGrid = React.forwardRef<
  HTMLDivElement,
  LitterboxTrendGridProps
>(({ days, ...props }, ref) => {
  const columns = React.useMemo(() => createLitterboxDotColumns(days), [days]);
  return <LitterboxDotGrid ref={ref} columns={columns} {...props} />;
});

LitterboxTrendGrid.displayName = 'LitterboxTrendGrid';

export { type LitterboxTrendGridProps };
export default LitterboxTrendGrid;
