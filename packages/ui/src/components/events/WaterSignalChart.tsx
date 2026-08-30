import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { ChartLegend } from '@/components/charts/ChartLegend';
import { SignalTrace, type SignalBand } from '@/components/charts/SignalTrace';
import type { WaterPeriod } from './analyzeWaterSegments';

import './WaterSignalChart.css';

interface WaterSignalChartProps extends React.ComponentProps<'div'> {
  /** Bowl load samples, unsmoothed — smoothed here the way the analyzer does. */
  weights: number[];
  periods: WaterPeriod[];
  /** `inline` for a trace on a page among other things; see `ChartLegend`. */
  legendVariant?: 'bar' | 'inline';
  /** Passed through to `SignalTrace`; the page decides how tall a track is. */
  height?: number;
}

const STATE_COLORS: Record<string, string> = {
  drinking: 'var(--color-signal-drinking)',
  spill: 'var(--color-signal-spill)',
  noise: 'var(--color-signal-noise)',
};

const EMA_SPAN = 10; // must match analyzeWaterSegments and FountainController

/**
 * The same smoothing the analyzer classified against, so the bands land where
 * the line actually turns rather than a few samples off it.
 */
function emaSmooth(weights: number[]): number[] {
  if (weights.length === 0) return [];
  const alpha = 2 / (EMA_SPAN + 1);
  const out: number[] = new Array(weights.length);
  out[0] = weights[0];
  for (let i = 1; i < weights.length; i++) {
    out[i] = alpha * weights[i] + (1 - alpha) * out[i - 1];
  }
  return out;
}

/**
 * A drink, as the fountain's scale saw it: the bowl emptying, and which
 * stretches of that the analyzer counted as the cat taking water.
 */
const WaterSignalChart = React.forwardRef<
  HTMLDivElement,
  WaterSignalChartProps
>(
  (
    { className, weights, periods, legendVariant = 'bar', height, ...props },
    ref,
  ) => {
    const { t } = useTranslation();

    const smoothed = React.useMemo(() => emaSmooth(weights), [weights]);

    const bands = React.useMemo<SignalBand[]>(
      () =>
        periods.map((period, i) => ({
          key: `${period.state}-${i}`,
          start: period.start,
          end: period.end,
          color: STATE_COLORS[period.state] ?? 'transparent',
        })),
      [periods],
    );

    return (
      <div className={cn('water-signal-chart', className)} ref={ref} {...props}>
        <SignalTrace values={smoothed} bands={bands} height={height} />
        <ChartLegend
          variant={legendVariant}
          items={[
            {
              tone: STATE_COLORS.drinking,
              label: t('event_details.legend_drinking'),
            },
            {
              tone: STATE_COLORS.spill,
              label: t('event_details.legend_spill'),
            },
            {
              tone: STATE_COLORS.noise,
              label: t('event_details.legend_noise'),
            },
          ]}
        />
      </div>
    );
  },
);

WaterSignalChart.displayName = 'WaterSignalChart';

export { type WaterSignalChartProps };
export default WaterSignalChart;
