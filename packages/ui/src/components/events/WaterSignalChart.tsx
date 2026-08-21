import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { ChartLegend } from '@/components/charts/ChartLegend';
import { createPath } from '@/components/charts/path';
import { downsample } from '@/components/charts/downsample';
import type { WaterPeriod } from './analyzeWaterSegments';

import './WaterSignalChart.css';

interface WaterSignalChartProps extends React.ComponentProps<'div'> {
  weights: number[];
  periods: WaterPeriod[];
  sampleRate?: number;
}

const STATE_COLORS: Record<string, string> = {
  drinking: 'var(--water-color-drinking)',
  spill: 'var(--water-color-spill)',
  noise: 'var(--water-color-noise)',
};

const EMA_SPAN = 10; // must match analyzeWaterSegments and FountainController

function emaSmooth(weights: number[]): number[] {
  const alpha = 2 / (EMA_SPAN + 1);
  const out: number[] = new Array(weights.length);
  out[0] = weights[0];
  for (let i = 1; i < weights.length; i++) {
    out[i] = alpha * weights[i] + (1 - alpha) * out[i - 1];
  }
  return out;
}

const WaterSignalChart = React.forwardRef<
  HTMLDivElement,
  WaterSignalChartProps
>(({ className, weights, periods, sampleRate = 10, ...props }, ref) => {
  const { t } = useTranslation();

  const maxPoints = 800;
  const smoothedWeights = React.useMemo(() => emaSmooth(weights), [weights]);
  const displayWeights = React.useMemo(
    () => downsample(smoothedWeights, maxPoints),
    [smoothedWeights],
  );

  const scaleFactor = weights.length / displayWeights.length;

  const minWeight = Math.min(...smoothedWeights);
  const maxWeight = Math.max(...smoothedWeights);
  const range = maxWeight - minWeight || 1;
  const padding = range * 0.1;
  const paddedMin = minWeight - padding;
  const paddedMax = maxWeight + padding;

  const svgWidth = 400;
  const svgHeight = 150;

  const linePath = createPath(
    displayWeights,
    svgWidth,
    svgHeight,
    paddedMin,
    paddedMax,
  );

  const scaledPeriods = periods.map((p) => ({
    ...p,
    start: p.start / scaleFactor,
    end: p.end / scaleFactor,
  }));

  const duration = weights.length / sampleRate;

  return (
    <div className={cn('water-signal-chart', className)} ref={ref} {...props}>
      <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} preserveAspectRatio="none">
        {scaledPeriods.map((period, i) => {
          const x = (period.start / displayWeights.length) * svgWidth;
          const w =
            ((period.end - period.start) / displayWeights.length) * svgWidth;
          const color = STATE_COLORS[period.state] ?? 'transparent';
          return (
            <rect
              key={i}
              x={x}
              y={0}
              width={Math.max(w, 1)}
              height={svgHeight}
              fill={color}
            />
          );
        })}
        <path
          d={linePath}
          fill="none"
          stroke="var(--color-signal-line)"
          strokeWidth="2.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <ChartLegend
        items={[
          {
            tone: STATE_COLORS.drinking,
            label: t('event_details.legend_drinking'),
          },
          { tone: STATE_COLORS.spill, label: t('event_details.legend_spill') },
          { tone: STATE_COLORS.noise, label: t('event_details.legend_noise') },
        ]}
      />

      <div className="chart-duration">{duration.toFixed(1)}s</div>
    </div>
  );
});

WaterSignalChart.displayName = 'WaterSignalChart';

export { type WaterSignalChartProps };
export default WaterSignalChart;
