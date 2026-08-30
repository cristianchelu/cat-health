import * as React from 'react';
import { cn } from '@/lib/utils';
import './ChartLegend.css';

export type ChartLegendItem =
  | {
      label: string;
      /**
       * The series' colour, as a CSS value — usually a custom property read
       * through `var()`. The swatch derives its border from it, so a caller
       * names the colour once.
       */
      tone: string;
      swatch?: never;
    }
  | {
      label: string;
      /** A swatch the chart draws itself, when its key is not a flat colour. */
      swatch: React.ReactNode;
      tone?: never;
    };

interface ChartLegendProps extends Omit<
  React.ComponentProps<'div'>,
  'children'
> {
  items: readonly ChartLegendItem[];
  /**
   * `bar` rules the key off from a chart that fills its own box; `inline`
   * leaves it bare for a chart sitting on a page among other things.
   */
  variant?: 'bar' | 'inline';
}

/**
 * The key under a signal chart: a swatch and a name per series.
 *
 * Shared so two charts of the same signal cannot end up with two type scales
 * and two swatch sizes. The colour is data rather than a class per series —
 * every swatch was already the same tone-plus-mixed-border formula, written
 * out seven times across two files.
 */
const ChartLegend = React.forwardRef<HTMLDivElement, ChartLegendProps>(
  ({ items, variant = 'bar', className, ...props }, ref) => (
    <div
      className={cn('chart-legend', variant, className)}
      ref={ref}
      {...props}
    >
      {items.map((item) => (
        <span className="chart-legend-item" key={item.label}>
          {item.swatch ?? (
            <span
              className="chart-legend-swatch"
              style={
                { '--chart-legend-tone': item.tone } as React.CSSProperties
              }
              aria-hidden="true"
            />
          )}
          <span>{item.label}</span>
        </span>
      ))}
    </div>
  ),
);

ChartLegend.displayName = 'ChartLegend';

export { ChartLegend };
