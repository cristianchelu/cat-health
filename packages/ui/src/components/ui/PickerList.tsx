import * as React from 'react';
import { cn } from '@/lib/utils';
import { PickerRow } from './PickerRow';
import { groupOptions, type PickerOption } from './pickerOptions';
import './PickerList.css';

export interface PickerListProps extends Omit<
  React.ComponentProps<'div'>,
  'onSelect'
> {
  options: readonly PickerOption[];
  /** The chosen value, for lists where a row is a choice rather than a door. */
  value?: string;
  onSelect?: (value: string) => void;
  /**
   * Rows rendered above the options — Recent in the log flow, "Not linked" in
   * the feeder. A node, so the caller owns its copy and its selected state.
   */
  leadingRow?: React.ReactNode;
  /** Shown when there is nothing to list and no leading row to stand in. */
  emptyLabel?: string;
  /**
   * Announces what a row *is*. `radio` for a group of options, where the list
   * is the answer to one question; omitted for a ladder of destinations, where
   * a row goes somewhere rather than meaning something.
   */
  optionRole?: 'radio';
}

/**
 * One column of choosable rows — the list every picker in the app is made of.
 *
 * The food ladder, the feeder's food field, and the cat and type levels of the
 * event fix form are all this component with different options in it. That is
 * the point: the separator rule, the empty state, the grouping and the way a
 * selected row reads are decided once, so a fix to one picker is a fix to all
 * of them. Options carrying a `group` are drawn under headings, in first-seen
 * order; without one they run flat.
 *
 * No scroller of its own: the surface holding the list owns scrolling, so a
 * sheet has one scroll area under a header that stays put — not two nested
 * ones that fight over the gesture.
 */
export const PickerList: React.FC<PickerListProps> = ({
  options,
  value,
  onSelect,
  leadingRow,
  emptyLabel,
  optionRole,
  className,
  ...props
}) => {
  const groups = React.useMemo(() => groupOptions(options), [options]);

  if (options.length === 0 && leadingRow == null) {
    return (
      <div className={cn('picker-list', className)} {...props}>
        {emptyLabel != null && (
          <p className="picker-list-empty">{emptyLabel}</p>
        )}
      </div>
    );
  }

  return (
    <div className={cn('picker-list', className)} {...props}>
      {leadingRow}
      {groups.map((group) => (
        <React.Fragment key={group.heading ?? '_'}>
          {group.heading && (
            <div className="picker-list-heading">{group.heading}</div>
          )}
          {group.options.map((option) => (
            <PickerRow
              key={option.value}
              role={optionRole}
              aria-checked={
                optionRole === 'radio' ? option.value === value : undefined
              }
              disabled={option.disabled}
              leading={option.leading}
              title={option.label}
              subtitle={option.subline}
              trailing={option.trailing}
              chevron={option.chevron}
              muted={option.muted}
              selected={option.value === value}
              onClick={() => onSelect?.(option.value)}
            />
          ))}
        </React.Fragment>
      ))}
    </div>
  );
};

export default PickerList;
