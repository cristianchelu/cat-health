import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
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

// LTTB downsampling — preserves visual shape far better than simple decimation
function downsample(data: number[], maxPoints: number): number[] {
  if (data.length <= maxPoints) return data;

  const sampled: number[] = [];
  const bucketSize = (data.length - 2) / (maxPoints - 2);

  sampled.push(data[0]);

  for (let i = 0; i < maxPoints - 2; i++) {
    const bucketStart = Math.floor(i * bucketSize) + 1;
    const bucketEnd = Math.floor((i + 1) * bucketSize) + 1;
    const nextBucketStart = Math.floor((i + 1) * bucketSize) + 1;
    const nextBucketEnd = Math.floor((i + 2) * bucketSize) + 1;

    let nextAvg = 0;
    const nextLen = Math.min(nextBucketEnd, data.length) - nextBucketStart;
    for (let j = nextBucketStart; j < Math.min(nextBucketEnd, data.length); j++) {
      nextAvg += data[j];
    }
    nextAvg /= nextLen || 1;

    const prevX = sampled.length - 1;
    const prevY = sampled[sampled.length - 1];
    const nextX = i + 2;
    const nextY = nextAvg;

    let maxArea = -1;
    let maxIdx = bucketStart;
    for (let j = bucketStart; j < Math.min(bucketEnd, data.length); j++) {
      const area = Math.abs(
        (prevX - nextX) * (data[j] - prevY) -
        (prevX - (j - bucketStart + i + 1)) * (nextY - prevY),
      );
      if (area > maxArea) { maxArea = area; maxIdx = j; }
    }
    sampled.push(data[maxIdx]);
  }

  sampled.push(data[data.length - 1]);
  return sampled;
}

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

const WaterSignalChart = React.forwardRef<HTMLDivElement, WaterSignalChartProps>(
  ({ className, weights, periods, sampleRate = 10, ...props }, ref) => {
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

    const linePath = createPath(displayWeights, svgWidth, svgHeight, paddedMin, paddedMax);

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
            const w = ((period.end - period.start) / displayWeights.length) * svgWidth;
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

        <div className="chart-legend">
          <div className="legend-item">
            <span className="legend-color drinking" />
            <span>{t('event_details.legend_drinking')}</span>
          </div>
          <div className="legend-item">
            <span className="legend-color spill" />
            <span>{t('event_details.legend_spill')}</span>
          </div>
          <div className="legend-item">
            <span className="legend-color noise" />
            <span>{t('event_details.legend_noise')}</span>
          </div>
        </div>

        <div className="chart-duration">
          {duration.toFixed(1)}s
        </div>
      </div>
    );
  },
);

WaterSignalChart.displayName = 'WaterSignalChart';

export { type WaterSignalChartProps };
export default WaterSignalChart;
