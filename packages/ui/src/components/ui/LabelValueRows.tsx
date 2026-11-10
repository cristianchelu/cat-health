import * as React from 'react';
import { cn } from '@/lib/utils';
import './LabelValueRows.css';

interface LabelValueRow {
  key: string;
  /** What the value is. */
  label: React.ReactNode;
  /** The value, already formatted: the rows never format. */
  value: React.ReactNode;
}

interface LabelValueRowsProps extends Omit<
  React.ComponentProps<'dl'>,
  'children'
> {
  rows: readonly LabelValueRow[];
}

/**
 * What a setting comes to, one fact a line: the label on the left, its value
 * on the right. Where `ReadoutGrid` sets numbers side by side under a chart,
 * these are read as sentences under a control.
 */
const LabelValueRows = React.forwardRef<HTMLDListElement, LabelValueRowsProps>(
  ({ rows, className, ...props }, ref) =>
    rows.length === 0 ? null : (
      <dl className={cn('label-value-rows', className)} ref={ref} {...props}>
        {rows.map((row) => (
          <div className="label-value-row" key={row.key}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    ),
);

LabelValueRows.displayName = 'LabelValueRows';

export { LabelValueRows, type LabelValueRowsProps, type LabelValueRow };
