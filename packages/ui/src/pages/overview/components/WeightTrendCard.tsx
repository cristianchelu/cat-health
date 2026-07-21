import React from 'react';
import { useTranslation } from 'react-i18next';
import { usePetWeightTrends } from '@/hooks/queries/petQueries';
import {
  useRegionalPreferences,
  useFormatters,
} from '@/contexts/RegionalPreferencesProvider';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { ArrowRight, Scale } from 'lucide-react';
import { formatRelative } from 'date-fns';
import { cn, formatCalendarDate } from '@/lib/utils';
import UntrackedRegionOverlay from '@/components/charts/UntrackedRegionOverlay';
import type { WeightTrendPointDTO } from 'shared';

import './WeightTrendCard.css';

interface WeightTrendCardProps {
  petId: number;
  isPending?: boolean;
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

const WeightTrendCard: React.FC<WeightTrendCardProps> = ({
  petId,
  isPending = false,
}) => {
  const { t } = useTranslation();
  const { timezone } = useRegionalPreferences();
  const { formatDate, formatNumber } = useFormatters();
  const {
    data: weightData,
    isLoading: isQueryLoading,
    error,
  } = usePetWeightTrends(petId, 15);
  const isLoading = isQueryLoading || isPending;

  const showEmpty =
    !isLoading && (error || !weightData || weightData.points.length === 0);

  if (showEmpty) {
    return (
      <Card className="weight-trend-card">
        <CardHeader>
          <Scale style={{ marginRight: 'auto' }} />
          <span className="weight-value">-.-- kg</span>
        </CardHeader>
        <CardContent noPadding empty className="weight-chart-slot">
          <p>{t('overview.no_weight_data')}</p>
        </CardContent>
      </Card>
    );
  }

  let chartBody: React.ReactNode = null;
  let headerRight: React.ReactNode = null;

  if (isLoading || !weightData) {
    headerRight = (
      <div className="weight-trend-info weight-trend-info--pending" aria-hidden>
        <ArrowRight className={cn('trend-icon', 'stable')} />
        <div className="weight-value">-.-- kg</div>
        <div className="weight-time">{'\u00a0'}</div>
      </div>
    );
    chartBody = <div className="weight-chart" aria-hidden />;
  } else {
    const points = weightData.points;
    const rangeEnd = new Date(weightData.rangeEnd).getTime();
    const dailyPoints = aggregateDailyMedian(points);
    // Anchor the left edge to the first available reading rather than the
    // fixed lookback window, so the plotted line always reaches x=0 instead
    // of leaving a gap when history is shorter than the requested range.
    const chartStart = new Date(dailyPoints[0].timestamp).getTime();
    const todayKey = formatCalendarDate(new Date(), timezone);
    const todayPoint = points.find((point) => point.date === todayKey);
    const latestPoint = points[points.length - 1];

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

    // Day-resolution litterbox-outage/pet-away gaps — the same whole-day
    // buckets that drive `todayTracked` below, so a stale day renders as one
    // hatch block instead of the fragmented hour-by-hour blips a finer
    // resolution (or a synthetic "since last weigh-in" tail) would produce.
    const overlayIntervals = weightData.untrackedDayIntervals;

    const formatWeight = (weight: number) =>
      `${formatNumber(weight / 1000, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} kg`;

    const oldestWeight = points[0]?.weight ?? 0;
    const latestWeight = latestPoint?.weight ?? 0;
    const weightChange = latestWeight - oldestWeight;
    const weightChangePercent =
      oldestWeight > 0 ? (weightChange / oldestWeight) * 100 : 0;

    const trendInfo =
      Math.abs(weightChangePercent) < 1
        ? 'stable'
        : weightChangePercent > 0
          ? 'gaining'
          : 'losing';

    const headerWeight = !weightData.todayTracked
      ? null
      : (todayPoint?.weight ?? latestPoint?.weight ?? null);

    const headerTimestamp = todayPoint?.timestamp ?? latestPoint?.timestamp;
    const timeLabel = headerTimestamp
      ? todayPoint
        ? formatRelative(new Date(headerTimestamp), new Date())
        : formatDate(new Date(headerTimestamp), 'short')
      : '';

    headerRight = (
      <div className="weight-trend-info">
        <ArrowRight className={cn('trend-icon', trendInfo)} />
        <div
          className={cn('weight-value', {
            'weight-value--untracked': headerWeight == null,
          })}
        >
          {headerWeight == null ? '-.-- kg' : formatWeight(headerWeight)}
        </div>
        <div className="weight-time">{timeLabel}</div>
      </div>
    );

    chartBody = (
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="weight-chart"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="weightGradient" x1="0%" y1="0%" x2="0%" y2="100%">
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
          intervals={overlayIntervals}
          minTime={chartStart}
          maxTime={rangeEnd}
          patternId="weight-trend-untracked"
          chartWidth={CHART_WIDTH}
          chartHeight={CHART_HEIGHT}
          fadeFromTop
        />
      </svg>
    );
  }

  return (
    <Card className="weight-trend-card" isLoading={isLoading}>
      <CardHeader>
        <Scale style={{ marginRight: 'auto' }} />
        {headerRight}
      </CardHeader>
      <CardContent noPadding className="weight-chart-slot">
        {chartBody}
      </CardContent>
    </Card>
  );
};

export default WeightTrendCard;
