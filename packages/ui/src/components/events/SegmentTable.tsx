import * as React from 'react';
import { cn } from '@/lib/utils';
import './SegmentTable.css';

export interface SegmentTableRow {
  key: string;
  /** The band's tint, as a CSS colour. */
  color: string;
  name: React.ReactNode;
  /** What the row's own numbers decided, under the name. */
  note?: React.ReactNode;
  /** Already formatted — this table never formats. */
  length: React.ReactNode;
  spread: React.ReactNode;
}

export interface SegmentTableProps extends Omit<
  React.ComponentProps<'table'>,
  'children'
> {
  columns: { name: string; length: string; spread: string };
  rows: readonly SegmentTableRow[];
}

/**
 * One row per stretch an analyzer found: its colour, its name, how long it
 * ran, and how much the signal moved inside it.
 *
 * A real table, because it is four columns of one kind of thing each and a
 * screen reader has to be able to read a number back against the section it
 * belongs to. Values arrive formatted; nothing here knows what a gram is.
 */
const SegmentTable = React.forwardRef<HTMLTableElement, SegmentTableProps>(
  ({ columns, rows, className, ...props }, ref) => (
    <table className={cn('segment-table', className)} ref={ref} {...props}>
      <thead>
        <tr>
          <th scope="col">
            <span className="sr-only">{columns.name}</span>
          </th>
          <th scope="col">{columns.name}</th>
          <th scope="col">{columns.length}</th>
          <th scope="col">{columns.spread}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <td>
              <span
                className="segment-table-swatch"
                style={{ background: row.color }}
                aria-hidden="true"
              />
            </td>
            <th scope="row">
              {row.name}
              {row.note != null && <small>{row.note}</small>}
            </th>
            <td className="segment-table-number">{row.length}</td>
            <td className="segment-table-number quiet">{row.spread}</td>
          </tr>
        ))}
      </tbody>
    </table>
  ),
);

SegmentTable.displayName = 'SegmentTable';

export { SegmentTable };
