import * as React from 'react';
import { Check, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import './PickerRow.css';

interface PickerRowProps extends Omit<React.ComponentProps<'button'>, 'title'> {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** An avatar or icon at the head of the row. Decorative — the title names it. */
  leading?: React.ReactNode;
  /** Right-aligned metadata: a count, a kcal density, a last-logged note. */
  trailing?: React.ReactNode;
  /** `forward` drills into another level; `down` opens a picker. */
  chevron?: 'forward' | 'down' | 'none';
  selected?: boolean;
  /** For rows that name an absence — "Not linked", "No brand". */
  muted?: boolean;
}

/**
 * One row of a choosing list, wherever that list appears: the food ladder's
 * levels, the feeder's picker, the flat list a small library degrades to, the
 * cat and type pages of the event fix form. A selected row shows a check; a row
 * that leads somewhere shows a chevron. Never both — a row either picks or
 * navigates.
 *
 * How the choice is announced is the caller's, because it depends on the list:
 * a `radiogroup` of options wants `role="radio"` and `aria-checked`, while a
 * ladder of destinations wants neither. `selected` only draws the check and the
 * wash, and supplies `aria-current` when no role says otherwise.
 */
const PickerRow = React.forwardRef<HTMLButtonElement, PickerRowProps>(
  (
    {
      title,
      subtitle,
      leading,
      trailing,
      chevron = 'none',
      selected = false,
      muted = false,
      className,
      role,
      ...props
    },
    ref,
  ) => (
    <button
      type="button"
      ref={ref}
      className={cn(
        'picker-row',
        selected && 'selected',
        muted && 'muted',
        className,
      )}
      role={role}
      aria-current={role == null && selected ? true : undefined}
      {...props}
    >
      {leading != null && (
        <span className="picker-row-leading" aria-hidden="true">
          {leading}
        </span>
      )}
      <span className="picker-row-body">
        <span className="picker-row-title">{title}</span>
        {subtitle != null && (
          <span className="picker-row-subtitle">{subtitle}</span>
        )}
      </span>
      {trailing != null && (
        <span className="picker-row-trailing">{trailing}</span>
      )}
      {selected && (
        <Check size={18} aria-hidden="true" className="picker-row-check" />
      )}
      {!selected && chevron === 'forward' && (
        <ChevronRight
          size={16}
          aria-hidden="true"
          className="picker-row-chevron"
        />
      )}
      {!selected && chevron === 'down' && (
        <ChevronDown
          size={16}
          aria-hidden="true"
          className="picker-row-chevron"
        />
      )}
    </button>
  ),
);

PickerRow.displayName = 'PickerRow';

export { PickerRow, type PickerRowProps };
