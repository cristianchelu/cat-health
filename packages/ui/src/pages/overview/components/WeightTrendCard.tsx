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
import type { UntrackedIntervalDTO, WeightTrendPointDTO } from 'shared';

import './WeightTrendCard.css';

interface WeightTrendCardProps {
  petId: number;
  isPending?: boolean;
}

const CHART_WIDTH = 300;
const CHART_HEIGHT = 75;

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

function buildWeightOverlayIntervals(
  untrackedDayIntervals: UntrackedIntervalDTO[],
  latestPoint: WeightTrendPointDTO | undefined,
  rangeEndIso: string,
): UntrackedIntervalDTO[] {
  if (!latestPoint) {
    return [...untrackedDayIntervals];
  }

  const lastTime = new Date(latestPoint.timestamp).getTime();
  const rangeEnd = new Date(rangeEndIso).getTime();

  // Day-level hatch for coverage gaps before the last weigh-in (e.g. Monday outage).
  const embedded = untrackedDayIntervals.filter((interval) => {
    const start = new Date(interval.start).getTime();
    return start < lastTime;
  });

  const intervals = [...embedded];

  // Single tail from last weigh-in → now (vet + missing recent data).
  if (rangeEnd > lastTime) {
    intervals.push({
      start: latestPoint.timestamp,
      end: rangeEndIso,
    });
  }

  return intervals;
}

function createLinearPath(points: ChartPoint[]): string {
  if (points.length === 0) {
    return '';
  }

  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');
}

function createAreaPath(points: ChartPoint[], height: number): string {
  const linePath = createLinearPath(points);
  if (!linePath || points.length < 2) {
    return '';
  }

  const last = points[points.length - 1];
  const first = points[0];
  return `${linePath} L ${last.x} ${height} L ${first.x} ${height} Z`;
}

function toChartPoints(
  points: WeightTrendPointDTO[],
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
    const rangeStart = new Date(weightData.rangeStart).getTime();
    const rangeEnd = new Date(weightData.rangeEnd).getTime();
    const todayKey = formatCalendarDate(new Date(), timezone);
    const todayPoint = points.find((point) => point.date === todayKey);
    const latestPoint = points[points.length - 1];

    const weights = points.map((point) => point.weight);
    const minWeight = Math.min(...weights);
    const maxWeight = Math.max(...weights);
    const weightRange = maxWeight - minWeight || 1;
    const padding = weightRange * 0.1;
    const paddedMinWeight = minWeight - padding;
    const paddedWeightRange = maxWeight - minWeight + padding * 2 || 1;

    const chartPoints = toChartPoints(
      points,
      rangeStart,
      rangeEnd,
      paddedMinWeight,
      paddedWeightRange,
    );
    const areaPath = createAreaPath(chartPoints, CHART_HEIGHT);
    const linePath = createLinearPath(chartPoints);

    const overlayIntervals = buildWeightOverlayIntervals(
      weightData.untrackedDayIntervals,
      latestPoint,
      weightData.rangeEnd,
    );

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
        <UntrackedRegionOverlay
          intervals={overlayIntervals}
          minTime={rangeStart}
          maxTime={rangeEnd}
          patternId="weight-trend-untracked"
          chartWidth={CHART_WIDTH}
          chartHeight={CHART_HEIGHT}
          fadeFromTop
        />
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
