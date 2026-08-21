import * as React from 'react';
import { Check, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import './FoodPickerRow.css';

interface FoodPickerRowProps extends Omit<
  React.ComponentProps<'button'>,
  'title'
> {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Right-aligned metadata: a count, a kcal density, a last-logged note. */
  trailing?: React.ReactNode;
  /** `forward` drills into another level; `down` opens a picker. */
  chevron?: 'forward' | 'down' | 'none';
  selected?: boolean;
  /** For rows that name an absence — "Not linked", "No brand". */
  muted?: boolean;
}

/**
 * One row of a food-choosing list, wherever that list appears: the log
 * ladder's levels, the feeder's picker, the flat list a small library
 * degrades to. A selected row shows a check; a row that leads somewhere
 * shows a chevron. Never both — a row either picks or navigates.
 */
const FoodPickerRow = React.forwardRef<HTMLButtonElement, FoodPickerRowProps>(
  (
    {
      title,
      subtitle,
      trailing,
      chevron = 'none',
      selected = false,
      muted = false,
      className,
      ...props
    },
    ref,
  ) => (
    <button
      type="button"
      ref={ref}
      className={cn(
        'food-picker-row',
        selected && 'selected',
        muted && 'muted',
        className,
      )}
      aria-current={selected || undefined}
      {...props}
    >
      <span className="food-picker-row-body">
        <span className="food-picker-row-title">{title}</span>
        {subtitle != null && (
          <span className="food-picker-row-subtitle">{subtitle}</span>
        )}
      </span>
      {trailing != null && (
        <span className="food-picker-row-trailing">{trailing}</span>
      )}
      {selected && (
        <Check size={18} aria-hidden="true" className="food-picker-row-check" />
      )}
      {!selected && chevron === 'forward' && (
        <ChevronRight
          size={16}
          aria-hidden="true"
          className="food-picker-row-chevron"
        />
      )}
      {!selected && chevron === 'down' && (
        <ChevronDown
          size={16}
          aria-hidden="true"
          className="food-picker-row-chevron"
        />
      )}
    </button>
  ),
);

FoodPickerRow.displayName = 'FoodPickerRow';

export { FoodPickerRow, type FoodPickerRowProps };
