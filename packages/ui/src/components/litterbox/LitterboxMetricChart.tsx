import * as React from 'react';
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

interface LitterboxMetricChartProps extends React.ComponentProps<'div'> {
  title: string;
  unit: string;
  series: LitterboxMetricChartSeries[];
  emptyLabel: string;
}

function getX(timestamp: string, minTime: number, maxTime: number): number {
  if (maxTime === minTime) return 50;
  return ((new Date(timestamp).getTime() - minTime) / (maxTime - minTime)) * 100;
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
  ...props
}) => {
  const allPoints = series.flatMap((item) => item.points);
  const values = allPoints.map((point) => point.value);
  const maxValue = Math.max(...values, 1);
  const times = allPoints.map((point) => new Date(point.timestamp).getTime());
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const hasData = allPoints.length > 0;
  const tickValues = hasData
    ? [maxValue, maxValue * 0.75, maxValue * 0.5, maxValue * 0.25].filter(
        (value) => value > 0,
      )
    : [];

  return (
    <div className={cn('litterbox-metric-chart', className)} {...props}>
      <div className="litterbox-metric-chart-header">
        <h3>{title}</h3>
        <span>{unit}</span>
      </div>
      {!hasData ? (
        <div className="litterbox-metric-chart-empty">{emptyLabel}</div>
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
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img">
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
