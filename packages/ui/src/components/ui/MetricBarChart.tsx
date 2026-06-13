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
            if (!day.tracked) {
              // Untracked day - show diagonal stripes at full height
              return (
                <div key={index} className="bar-wrapper">
                  <div className="bar-background">
                    <div className="bar-fill untracked untracked-pattern" />
                  </div>
                </div>
              );
            }

            const currentLowerBound = day.lowerBound ?? lowerBound;
            const currentUpperBound = day.upperBound ?? upperBound;

            // Calculate fill percentage relative to max value
            const fillPercent = (day.value / maxValue) * 100;

            // Calculate reference line positions if bounds are provided
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

            // Calculate status based on bounds
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
