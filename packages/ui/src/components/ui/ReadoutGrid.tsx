import * as React from 'react';
import { cn } from '@/lib/utils';
import './ReadoutGrid.css';

export interface Readout {
  key: string;
  /** What the number is. */
  label: React.ReactNode;
  /** The number, already formatted — the grid never formats. */
  value: React.ReactNode;
}

interface ReadoutGridProps extends Omit<
  React.ComponentProps<'div'>,
  'children'
> {
  readouts: readonly Readout[];
  /** Columns across. Three is what a sheet's width takes without wrapping. */
  columns?: number;
}

/**
 * Numbers read off a chart, in a row under it.
 *
 * The plain counterpart to {@link EventFacts}: no glyph, no tint, no tone —
 * these are the axis values a trace does not have room to write on itself,
 * and they are read down the column rather than picked out one at a time.
 *
 * Values are tabular so a column of them lines up on the decimal point, and
 * the caller hands them in already formatted: units, locale and precision all
 * belong to whoever owns the reading.
 */
const ReadoutGrid = React.forwardRef<HTMLDivElement, ReadoutGridProps>(
  ({ readouts, columns = 3, className, style, ...props }, ref) =>
    readouts.length === 0 ? null : (
      <div
        className={cn('readout-grid', className)}
        ref={ref}
        style={
          {
            '--readout-grid-columns': columns,
            ...style,
          } as React.CSSProperties
        }
        {...props}
      >
        {readouts.map((readout) => (
          <div className="readout" key={readout.key}>
            <span className="readout-label">{readout.label}</span>
            <span className="readout-value">{readout.value}</span>
          </div>
        ))}
      </div>
    ),
);

ReadoutGrid.displayName = 'ReadoutGrid';

export { ReadoutGrid };
