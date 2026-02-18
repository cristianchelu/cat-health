import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { StatePeriod } from './litterboxStateTracker';

import './WeightSignalChart.css';

interface WeightSignalChartProps extends React.ComponentProps<'div'> {
  weights: number[];
  periods: StatePeriod[];
  sampleRate?: number;
}

const STATE_COLORS: Record<string, string> = {
  entering: 'var(--color-state-entering)',
  occupied: 'var(--color-state-occupied)',
  eliminating: 'var(--color-state-eliminating)',
  gap: 'var(--color-state-gap)',
};

// LTTB (Largest Triangle Three Buckets) downsampling
// Preserves visual shape much better than simple decimation
function downsample(data: number[], maxPoints: number): number[] {
  if (data.length <= maxPoints) return data;

  const sampled: number[] = [];
  const bucketSize = (data.length - 2) / (maxPoints - 2);

  // Always keep first point
  sampled.push(data[0]);

  for (let i = 0; i < maxPoints - 2; i++) {
    // Calculate bucket boundaries
    const bucketStart = Math.floor((i + 0) * bucketSize) + 1;
    const bucketEnd = Math.floor((i + 1) * bucketSize) + 1;

    // Calculate next bucket average for triangle area calculation
    const nextBucketStart = Math.floor((i + 1) * bucketSize) + 1;
    const nextBucketEnd = Math.floor((i + 2) * bucketSize) + 1;

    let nextAvg = 0;
    const nextBucketLen = Math.min(nextBucketEnd, data.length) - nextBucketStart;
    for (let j = nextBucketStart; j < Math.min(nextBucketEnd, data.length); j++) {
      nextAvg += data[j];
    }
    nextAvg /= nextBucketLen || 1;

    // Find point in current bucket that creates largest triangle
    const prevX = sampled.length - 1;
    const prevY = sampled[sampled.length - 1];
    const nextX = i + 2;
    const nextY = nextAvg;

    let maxArea = -1;
    let maxIdx = bucketStart;

    for (let j = bucketStart; j < Math.min(bucketEnd, data.length); j++) {
      // Triangle area calculation
      const area = Math.abs(
        (prevX - nextX) * (data[j] - prevY) -
        (prevX - (j - bucketStart + i + 1)) * (nextY - prevY)
      );

      if (area > maxArea) {
        maxArea = area;
        maxIdx = j;
      }
    }

    sampled.push(data[maxIdx]);
  }

  // Always keep last point
  sampled.push(data[data.length - 1]);

  return sampled;
}

// Create SVG path from points
function createPath(
  weights: number[],
  width: number,
  height: number,
  minWeight: number,
  maxWeight: number,
): string {
  if (weights.length === 0) return '';

  const range = maxWeight - minWeight || 1;
  const xStep = width / (weights.length - 1 || 1);

  let path = '';
  for (let i = 0; i < weights.length; i++) {
    const x = i * xStep;
    const y = height - ((weights[i] - minWeight) / range) * height;
    path += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
  }

  return path;
}

const WeightSignalChart = React.forwardRef<HTMLDivElement, WeightSignalChartProps>(
  ({ className, weights, periods, sampleRate = 10, ...props }, ref) => {
    const { t } = useTranslation();
    // Downsampling disabled for debugging
    const maxPoints = 800;
    const displayWeights = React.useMemo(
      () => downsample(weights, maxPoints),
      [weights],
    );
    // const displayWeights = weights;

    const scaleFactor = weights.length / displayWeights.length;

    // Calculate bounds with padding
    const minWeight = Math.min(...weights);
    const maxWeight = Math.max(...weights);
    const range = maxWeight - minWeight || 1;
    const padding = range * 0.1;
    const paddedMin = minWeight - padding;
    const paddedMax = maxWeight + padding;

    // SVG dimensions
    const width = 400;
    const height = 150;

    const linePath = createPath(displayWeights, width, height, paddedMin, paddedMax);

    // Scale periods to display coordinates
    const scaledPeriods = periods.map((p) => ({
      ...p,
      start: p.start / scaleFactor,
      end: p.end / scaleFactor,
    }));

    const duration = weights.length / sampleRate;

    return (
      <div className={cn('weight-signal-chart', className)} ref={ref} {...props}>
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
          {/* State period backgrounds */}
          {scaledPeriods.map((period, i) => {
            const x = (period.start / displayWeights.length) * width;
            const periodWidth =
              ((period.end - period.start) / displayWeights.length) * width;
            const color = STATE_COLORS[period.state] || 'transparent';

            return (
              <rect
                key={i}
                x={x}
                y={0}
                width={Math.max(periodWidth, 1)}
                height={height}
                fill={color}
              />
            );
          })}

          {/* Weight signal line */}
          <path
            d={linePath}
            fill="none"
            stroke="var(--color-signal-line)"
            strokeWidth="2.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* Legend */}
        <div className="chart-legend">
          <div className="legend-item">
            <span className="legend-color entering" />
            <span>{t('event_details.legend_entering')}</span>
          </div>
          <div className="legend-item">
            <span className="legend-color occupied" />
            <span>{t('event_details.legend_occupied')}</span>
          </div>
          <div className="legend-item">
            <span className="legend-color eliminating" />
            <span>{t('event_details.legend_eliminating')}</span>
          </div>
          <div className="legend-item">
            <span className="legend-color gap" />
            <span>{t('event_details.legend_gap')}</span>
          </div>
        </div>

        {/* Duration label */}
        <div className="chart-duration">
          {duration.toFixed(1)}s
        </div>
      </div>
    );
  },
);

WeightSignalChart.displayName = 'WeightSignalChart';

export { type WeightSignalChartProps };
export default WeightSignalChart;
