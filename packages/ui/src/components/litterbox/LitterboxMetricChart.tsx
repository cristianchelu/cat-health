import * as React from 'react';
import { addDays, format, isSameDay, startOfDay, startOfWeek, type Locale } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import './LitterboxMetricChart.css';

export interface LitterboxMetricChartPoint {
  timestamp: string;
  value: number;
  label?: string;
  straining?: boolean;
}

export interface LitterboxMetricChartSeries {
  id: string;
  label: string;
  color: string;
  points: LitterboxMetricChartPoint[];
}

export interface LitterboxMetricChartTimeRange {
  startTime: string;
  endTime: string;
}

interface LitterboxMetricChartProps extends React.ComponentProps<'div'> {
  title: string;
  unit: string;
  series: LitterboxMetricChartSeries[];
  emptyLabel: string;
  timeRange?: LitterboxMetricChartTimeRange;
  locale?: Locale;
}

function getX(time: number | string, minTime: number, maxTime: number): number {
  const timestamp = typeof time === 'number' ? time : new Date(time).getTime();
  if (maxTime === minTime) return 50;
  return ((timestamp - minTime) / (maxTime - minTime)) * 100;
}

function getDayBoundaryTimes(startTime: string, endTime: string): number[] {
  const rangeStart = new Date(startTime).getTime();
  const rangeEnd = new Date(endTime).getTime();
  const boundaries: number[] = [];

  let dayStart = addDays(startOfDay(new Date(startTime)), 1);
  const lastDayStart = startOfDay(new Date(endTime));

  while (dayStart.getTime() <= lastDayStart.getTime()) {
    const time = dayStart.getTime();
    if (time > rangeStart && time < rangeEnd) {
      boundaries.push(time);
    }
    dayStart = addDays(dayStart, 1);
  }

  return boundaries;
}

function isWeekStartBoundary(dayStart: Date, locale: Locale): boolean {
  return isSameDay(dayStart, startOfWeek(dayStart, { locale }));
}

function formatWeekBoundaryLabel(date: Date, locale: Locale): string {
  return format(date, 'MMM d', { locale });
}

function getY(value: number, maxValue: number): number {
  if (maxValue <= 0) return 90;
  return 90 - (value / maxValue) * 80;
}

function formatTickValue(value: number, unit: string): string {
  const formatted = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: value >= 10 ? 0 : 1,
  }).format(value);

  if (unit.toLowerCase().includes('hour')) return `${formatted}h`;
  if (unit.toLowerCase().includes('second')) return `${formatted}s`;
  if (unit.toLowerCase().includes('gram')) return `${formatted}g`;
  return formatted;
}

const LitterboxMetricChart: React.FC<LitterboxMetricChartProps> = ({
  className,
  title,
  unit,
  series,
  emptyLabel,
  timeRange,
  locale = enUS,
  ...props
}) => {
  const allPoints = series.flatMap((item) => item.points);
  const values = allPoints.map((point) => point.value);
  const maxValue = Math.max(...values, 1);
  const times = allPoints.map((point) => new Date(point.timestamp).getTime());
  const dataMinTime = times.length > 0 ? Math.min(...times) : 0;
  const dataMaxTime = times.length > 0 ? Math.max(...times) : 0;
  const minTime = timeRange
    ? new Date(timeRange.startTime).getTime()
    : dataMinTime;
  const maxTime = timeRange
    ? new Date(timeRange.endTime).getTime()
    : dataMaxTime;
  const hasData = allPoints.length > 0;
  const dayBoundaries =
    timeRange !== undefined
      ? getDayBoundaryTimes(timeRange.startTime, timeRange.endTime)
      : [];
  const tickValues = hasData
    ? [maxValue, maxValue * 0.75, maxValue * 0.5, maxValue * 0.25].filter(
        (value) => value > 0,
      )
    : [];
  const weekBoundaryLabels = dayBoundaries.flatMap((boundaryTime) => {
    const dayStart = new Date(boundaryTime);
    if (!isWeekStartBoundary(dayStart, locale)) return [];

    const x = getX(boundaryTime, minTime, maxTime);
    if (x <= 0 || x >= 100) return [];

    return [
      {
        time: boundaryTime,
        x,
        label: formatWeekBoundaryLabel(dayStart, locale),
      },
    ];
  });

  return (
    <div className={cn('litterbox-metric-chart', className)} {...props}>
      {!hasData ? (
        <div className="litterbox-metric-chart-plot litterbox-metric-chart-plot--empty">
          <p className="litterbox-metric-chart-empty-label">{emptyLabel}</p>
        </div>
      ) : (
        <div className="litterbox-metric-chart-plot">
          <div className="litterbox-metric-chart-ticks" aria-hidden>
            {tickValues.map((value) => (
              <span
                key={value}
                style={{ top: `${getY(value, maxValue)}%` }}
              >
                {formatTickValue(value, unit)}
              </span>
            ))}
          </div>
          <div className="litterbox-metric-chart-week-labels" aria-hidden>
            {weekBoundaryLabels.map(({ time, x, label }) => (
              <span key={time} style={{ left: `${x}%` }}>
                {label}
              </span>
            ))}
          </div>
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            role="img"
            aria-label={title}
          >
            {dayBoundaries.map((boundaryTime) => {
              const x = getX(boundaryTime, minTime, maxTime);
              if (x <= 0 || x >= 100) return null;

              const dayStart = new Date(boundaryTime);
              const isWeekStart = isWeekStartBoundary(dayStart, locale);

              return (
                <line
                  key={boundaryTime}
                  className={cn('litterbox-metric-chart-gridline', {
                    'litterbox-metric-chart-gridline--day': !isWeekStart,
                  })}
                  x1={x}
                  x2={x}
                  y1={0}
                  y2={100}
                />
              );
            })}
            {tickValues.map((value) => (
              <line
                key={value}
                className="litterbox-metric-chart-gridline"
                x1="0"
                x2="100"
                y1={getY(value, maxValue)}
                y2={getY(value, maxValue)}
              />
            ))}
            {series.map((item) => {
              const sortedPoints = [...item.points].sort(
                (a, b) =>
                  new Date(a.timestamp).getTime() -
                  new Date(b.timestamp).getTime(),
              );
              const path = sortedPoints
                .map((point, index) => {
                  const x = getX(point.timestamp, minTime, maxTime);
                  const y = getY(point.value, maxValue);
                  return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
                })
                .join(' ');

              return (
                <g key={item.id}>
                  {sortedPoints.length > 1 && (
                    <path
                      className="litterbox-metric-chart-line"
                      d={path}
                      style={{ stroke: item.color }}
                    />
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </div>
  );
};

export default LitterboxMetricChart;
