import * as React from 'react';
import { cn } from '@/lib/utils';

import './MetricBarChart.css';

interface MetricBarChartProps extends React.ComponentProps<'div'> {
  data: Array<{
    value: number;
    tracked: boolean;
    lowerBound?: number;
    upperBound?: number;
  }>;
  maxValue: number;
  lowerBound?: number;
  upperBound?: number;
}

const MetricBarChart = React.forwardRef<HTMLDivElement, MetricBarChartProps>(
  ({ className, data, maxValue, lowerBound, upperBound, ...props }, ref) => {
    return (
      <div className={cn('metric-bar-chart', className)} ref={ref} {...props}>
        <div className="bars-container">
          {data.map((day, index) => {
            const currentLowerBound = day.lowerBound ?? lowerBound;
            const currentUpperBound = day.upperBound ?? upperBound;
            const fillPercent = (day.value / maxValue) * 100;

            const lowerLinePercent = currentLowerBound
              ? (currentLowerBound / maxValue) * 100
              : undefined;
            const upperLinePercent = currentUpperBound
              ? (currentUpperBound / maxValue) * 100
              : undefined;

            const lowerLineFilled =
              lowerLinePercent !== undefined && fillPercent >= lowerLinePercent;
            const upperLineFilled =
              upperLinePercent !== undefined && fillPercent >= upperLinePercent;

            const lowerLineInFillPercent =
              currentLowerBound !== undefined && day.value > 0
                ? (currentLowerBound / day.value) * 100
                : undefined;
            const upperLineInFillPercent =
              currentUpperBound !== undefined && day.value > 0
                ? (currentUpperBound / day.value) * 100
                : undefined;

            let status: 'below' | 'within' | 'above' | undefined;
            if (
              currentLowerBound !== undefined &&
              currentUpperBound !== undefined
            ) {
              if (day.value < currentLowerBound) {
                status = 'below';
              } else if (day.value > currentUpperBound) {
                status = 'above';
              } else {
                status = 'within';
              }
            }

            return (
              <div key={index} className="bar-wrapper">
                <div className="bar-background">
                  {!day.tracked && (
                    <div
                      className="bar-untracked-background untracked-pattern"
                      aria-hidden
                    />
                  )}
                  {lowerLinePercent !== undefined && !lowerLineFilled && (
                    <div
                      className="bar-reference-line lower"
                      style={{ bottom: `${lowerLinePercent}%` }}
                    />
                  )}
                  {upperLinePercent !== undefined && !upperLineFilled && (
                    <div
                      className="bar-reference-line upper"
                      style={{ bottom: `${upperLinePercent}%` }}
                    />
                  )}
                  {day.value > 0 && (
                    <div
                      className={cn('bar-fill', status)}
                      style={{ height: `${fillPercent}%` }}
                    >
                      {lowerLineFilled &&
                        lowerLineInFillPercent !== undefined && (
                          <div
                            className="bar-reference-line lower in-fill"
                            style={{
                              bottom: `${lowerLineInFillPercent}%`,
                            }}
                          />
                        )}
                      {upperLineFilled &&
                        upperLineInFillPercent !== undefined && (
                          <div
                            className="bar-reference-line upper in-fill"
                            style={{
                              bottom: `${upperLineInFillPercent}%`,
                            }}
                          />
                        )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  },
);

MetricBarChart.displayName = 'MetricBarChart';

export { type MetricBarChartProps };
export default MetricBarChart;
