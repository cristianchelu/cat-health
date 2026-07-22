import * as React from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { ArrowRight, Scale } from 'lucide-react';
import { cn } from '@/lib/utils';
import UntrackedRegionOverlay from '@/components/charts/UntrackedRegionOverlay';
import type { UntrackedIntervalDTO, WeightTrendPointDTO } from 'shared';

import './WeightTrendCard.css';

export type WeightTrend = 'gaining' | 'stable' | 'losing';

export type WeightTrendCardState =
  | { status: 'loading' }
  | { status: 'empty' }
  | {
      status: 'data';
      points: WeightTrendPointDTO[];
      /** Right edge of the plotted time range, in epoch ms. */
      rangeEnd: number;
      untrackedIntervals: UntrackedIntervalDTO[];
      trend: WeightTrend;
      /** Preformatted header weight (e.g. "4.20 kg"), or null when untracked. */
      headerWeightLabel: string | null;
      /** Preformatted relative/short timestamp for the header weight. */
      timeLabel: string;
    };

export interface WeightTrendCardViewProps {
  state: WeightTrendCardState;
  /** Text rendered in the chart slot when there is no weight history. */
  emptyLabel: string;
  /** Placeholder shown when the header weight is unavailable (e.g. "-.-- kg"). */
  placeholder: string;
}

const CHART_WIDTH = 300;
const CHART_HEIGHT = 75;

// Weight is stored in grams; clamp the y-axis to at least this many grams so
// day-to-day noise on an otherwise-flat weight doesn't produce a spiky chart.
const MIN_WEIGHT_RANGE_G = 500;

interface ChartPoint {
  x: number;
  y: number;
  weight: number;
  timestamp: string;
}

function timeToX(
  time: number,
  rangeStart: number,
  rangeEnd: number,
  width: number,
): number {
  if (rangeEnd <= rangeStart) {
    return 0;
  }

  const clamped = Math.min(Math.max(time, rangeStart), rangeEnd);
  return ((clamped - rangeStart) / (rangeEnd - rangeStart)) * width;
}

// Fritsch-Carlson monotone cubic Hermite tangents: unlike a plain
// Catmull-Rom fit, this keeps the curve's x strictly non-decreasing (no
// backward loops between unevenly time-spaced points) and never overshoots
// past a point's neighbors (no bumps that aren't in the data).
function monotoneCubicTangents(points: ChartPoint[]): number[] {
  const n = points.length;
  const tangents = new Array(n).fill(0);
  const deltas = new Array(n - 1).fill(0);

  for (let i = 0; i < n - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    deltas[i] = dx === 0 ? 0 : (points[i + 1].y - points[i].y) / dx;
  }

  tangents[0] = deltas[0];
  tangents[n - 1] = deltas[n - 2];
  for (let i = 1; i < n - 1; i++) {
    tangents[i] =
      deltas[i - 1] * deltas[i] <= 0 ? 0 : (deltas[i - 1] + deltas[i]) / 2;
  }

  for (let i = 0; i < n - 1; i++) {
    const d = deltas[i];
    if (d === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }

    const alpha = tangents[i] / d;
    const beta = tangents[i + 1] / d;
    const magnitude = Math.hypot(alpha, beta);
    if (magnitude > 3) {
      const tau = 3 / magnitude;
      tangents[i] = tau * alpha * d;
      tangents[i + 1] = tau * beta * d;
    }
  }

  return tangents;
}

function createSmoothLinePath(points: ChartPoint[]): string {
  if (points.length === 0) {
    return '';
  }

  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`;
  }

  const tangents = monotoneCubicTangents(points);
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const h = p1.x - p0.x;

    const cp1x = p0.x + h / 3;
    const cp1y = p0.y + (tangents[i] * h) / 3;
    const cp2x = p1.x - h / 3;
    const cp2y = p1.y - (tangents[i + 1] * h) / 3;

    path += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p1.x} ${p1.y}`;
  }

  return path;
}

function createSmoothAreaPath(points: ChartPoint[], height: number): string {
  const linePath = createSmoothLinePath(points);
  if (!linePath || points.length < 2) {
    return '';
  }

  const last = points[points.length - 1];
  const first = points[0];
  return `${linePath} L ${last.x} ${height} L ${first.x} ${height} Z`;
}

// Carries the last known weight flat out to the right edge of the chart so
// the plot never leaves a blank gap between the last reading and "now" —
// the untracked overlay indicates whether that carried-forward stretch is
// actually stale.
function extendToChartEdge(
  points: ChartPoint[],
  chartWidth: number,
): ChartPoint[] {
  const last = points[points.length - 1];
  if (!last || last.x >= chartWidth) {
    return points;
  }

  return [...points, { ...last, x: chartWidth }];
}

interface DailyWeightPoint {
  weight: number;
  timestamp: string;
}

// Litterbox-triggered weigh-ins are noisy (litter debris, partial stance);
// several can land on the same day and zigzag by tens of grams. Collapsing
// each day to its median gives the curve one representative value per day
// instead of every raw reading, which is what actually removes the zigzag —
// no amount of curve smoothing can do it, since smoothing still has to pass
// through every real value it's given.
function aggregateDailyMedian(
  points: WeightTrendPointDTO[],
): DailyWeightPoint[] {
  const byDate = new Map<string, WeightTrendPointDTO[]>();
  for (const point of points) {
    const bucket = byDate.get(point.date);
    if (bucket) {
      bucket.push(point);
    } else {
      byDate.set(point.date, [point]);
    }
  }

  return [...byDate.values()].map((dayPoints) => {
    const weights = [...dayPoints.map((p) => p.weight)].sort((a, b) => a - b);
    const mid = Math.floor(weights.length / 2);
    const median =
      weights.length % 2 === 0
        ? (weights[mid - 1] + weights[mid]) / 2
        : weights[mid];

    return {
      weight: median,
      timestamp: dayPoints[dayPoints.length - 1].timestamp,
    };
  });
}

function toChartPoints(
  points: DailyWeightPoint[],
  rangeStart: number,
  rangeEnd: number,
  paddedMinWeight: number,
  paddedWeightRange: number,
): ChartPoint[] {
  return points.map((point) => ({
    x: timeToX(
      new Date(point.timestamp).getTime(),
      rangeStart,
      rangeEnd,
      CHART_WIDTH,
    ),
    y:
      (1 - (point.weight - paddedMinWeight) / paddedWeightRange) * CHART_HEIGHT,
    weight: point.weight,
    timestamp: point.timestamp,
  }));
}

const WeightTrendCardView: React.FC<WeightTrendCardViewProps> = ({
  state,
  emptyLabel,
  placeholder,
}) => {
  if (state.status === 'empty') {
    return (
      <Card className="weight-trend-card">
        <CardHeader>
          <Scale style={{ marginRight: 'auto' }} />
          <span className="weight-value">{placeholder}</span>
        </CardHeader>
        <CardContent noPadding empty className="weight-chart-slot">
          <p>{emptyLabel}</p>
        </CardContent>
      </Card>
    );
  }

  if (state.status === 'loading') {
    return (
      <Card className="weight-trend-card" isLoading>
        <CardHeader>
          <Scale style={{ marginRight: 'auto' }} />
          <div
            className="weight-trend-info weight-trend-info--pending"
            aria-hidden
          >
            <ArrowRight className={cn('trend-icon', 'stable')} />
            <div className="weight-value">{placeholder}</div>
            <div className="weight-time">{' '}</div>
          </div>
        </CardHeader>
        <CardContent noPadding className="weight-chart-slot">
          <div className="weight-chart" aria-hidden />
        </CardContent>
      </Card>
    );
  }

  const { points, rangeEnd, untrackedIntervals, trend, headerWeightLabel, timeLabel } =
    state;

  const dailyPoints = aggregateDailyMedian(points);
  // Anchor the left edge to the first available reading rather than the fixed
  // lookback window, so the plotted line always reaches x=0 instead of leaving
  // a gap when history is shorter than the requested range.
  const chartStart = new Date(dailyPoints[0].timestamp).getTime();

  const weights = dailyPoints.map((point) => point.weight);
  const minWeight = Math.min(...weights);
  const maxWeight = Math.max(...weights);
  const dataMidWeight = (minWeight + maxWeight) / 2;
  const displayWeightRange =
    Math.max(maxWeight - minWeight, MIN_WEIGHT_RANGE_G) * 1.2;
  const paddedMinWeight = dataMidWeight - displayWeightRange / 2;
  const paddedWeightRange = displayWeightRange;

  const chartPoints = extendToChartEdge(
    toChartPoints(
      dailyPoints,
      chartStart,
      rangeEnd,
      paddedMinWeight,
      paddedWeightRange,
    ),
    CHART_WIDTH,
  );
  const areaPath = createSmoothAreaPath(chartPoints, CHART_HEIGHT);
  const linePath = createSmoothLinePath(chartPoints);

  return (
    <Card className="weight-trend-card">
      <CardHeader>
        <Scale style={{ marginRight: 'auto' }} />
        <div className="weight-trend-info">
          <ArrowRight className={cn('trend-icon', trend)} />
          <div
            className={cn('weight-value', {
              'weight-value--untracked': headerWeightLabel == null,
            })}
          >
            {headerWeightLabel ?? placeholder}
          </div>
          <div className="weight-time">{timeLabel}</div>
        </div>
      </CardHeader>
      <CardContent noPadding className="weight-chart-slot">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="weight-chart"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient
              id="weightGradient"
              x1="0%"
              y1="0%"
              x2="0%"
              y2="100%"
            >
              <stop
                offset="0%"
                stopColor="var(--color-primary)"
                stopOpacity="0.3"
              />
              <stop
                offset="100%"
                stopColor="var(--color-primary)"
                stopOpacity="0.1"
              />
            </linearGradient>
          </defs>
          {areaPath ? <path d={areaPath} fill="url(#weightGradient)" /> : null}
          {linePath ? (
            <path
              d={linePath}
              fill="none"
              stroke="var(--color-primary)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
          <UntrackedRegionOverlay
            intervals={untrackedIntervals}
            minTime={chartStart}
            maxTime={rangeEnd}
            patternId="weight-trend-untracked"
            chartWidth={CHART_WIDTH}
            chartHeight={CHART_HEIGHT}
            fadeFromTop
          />
        </svg>
      </CardContent>
    </Card>
  );
};

export default WeightTrendCardView;
