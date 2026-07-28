import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDownWideNarrow, ArrowUpNarrowWide } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toggleSortDirection, type SortDirection } from '@/lib/listSort';
import { Button } from './Button';
import { ControlGroup } from './ControlGroup';
import { Select } from './form';
import './SortControl.css';

interface SortOption<K extends string> {
  value: K;
  label: string;
}

interface SortControlProps<K extends string> {
  options: ReadonlyArray<SortOption<K>>;
  value: K;
  onValueChange: (value: K) => void;
  direction: SortDirection;
  onDirectionChange: (direction: SortDirection) => void;
  /** Accessible name for the key select. Toolbars have no room for a visible label. */
  label: string;
  /** Accessible name for the direction toggle. Defaults to the current direction. */
  directionLabel?: string;
  className?: string;
}

/**
 * Sort control for a listing toolbar: which key, and which way round.
 *
 * Two segments rather than one dropdown listing "Name A–Z / Name Z–A / Type
 * A–Z / …" — that list doubles in length with every key, and the direction is
 * the thing people flip repeatedly, so it deserves a single click.
 *
 * The direction arrow is the only icon here: it is what makes a dropdown reading
 * "Type" legible as a sort, so a second sort glyph inside the select would say
 * the same thing twice in the same widget.
 *
 * Generic over the key type: the caller gets its own union back in
 * `onValueChange`, resolved by looking the value up in `options`, so no page
 * needs a string-to-key type guard.
 */
function SortControl<K extends string>({
  options,
  value,
  onValueChange,
  direction,
  onDirectionChange,
  label,
  directionLabel,
  className,
}: SortControlProps<K>) {
  const { t } = useTranslation();

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = options.find(
      (option) => option.value === event.target.value,
    );
    if (selected) {
      onValueChange(selected.value);
    }
  };

  const ascending = direction === 'asc';
  const DirectionIcon = ascending ? ArrowUpNarrowWide : ArrowDownWideNarrow;
  /*
   * Names the direction that is currently applied, matching the icon. A label
   * describing the *next* direction would contradict the glyph for anyone who
   * can see both.
   */
  const resolvedDirectionLabel =
    directionLabel ??
    t(ascending ? 'common.sort_ascending' : 'common.sort_descending');

  return (
    <ControlGroup className={cn('sort-control', className)}>
      <Select
        className="sort-control-select"
        aria-label={label}
        value={value}
        onChange={handleChange}
        options={[...options]}
      />
      <Button
        type="button"
        /* The variant that shares a border with the select it is fused to. */
        variant="neutral"
        size="sm"
        icon
        title={resolvedDirectionLabel}
        aria-label={resolvedDirectionLabel}
        onClick={() => onDirectionChange(toggleSortDirection(direction))}
      >
        <DirectionIcon size={16} aria-hidden />
      </Button>
    </ControlGroup>
  );
}

export { SortControl, type SortControlProps, type SortOption };
