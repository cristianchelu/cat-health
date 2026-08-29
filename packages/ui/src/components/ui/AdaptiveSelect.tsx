import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsPhone } from '@/hooks/useIsPhone';
import { groupOptions, type PickerOption } from './pickerOptions';
import {
  SelectMenu,
  SelectMenuContent,
  SelectMenuGroup,
  SelectMenuItem,
  SelectMenuLabel,
  SelectMenuTrigger,
  SelectMenuValue,
} from './SelectMenu';
import './AdaptiveSelect.css';

export interface AdaptiveSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: PickerOption[];
  /** Names the control. */
  label: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  /**
   * Phone only: show the options as a level of the sheet this control lives
   * in, by rendering a `SelectPage` in place of the host's content.
   *
   * Without it the dropdown is used at every width. That is a working control,
   * not a broken one — but on a phone a dropdown of tall rows is a poor
   * substitute for a page, so a sheet that can host one should.
   */
  onOpenPage?: () => void;
}

/**
 * One picker, two anchors: a dropdown on the desktop, a page in the host sheet
 * on a phone.
 *
 * The phone half deliberately does **not** open a sheet of its own. Two sheets
 * at two different heights, one over the other, is the shape this replaced —
 * the seam was the first thing you saw. Instead the host swaps its own content
 * for a `SelectPage`, so the drawer never moves and only what is inside it
 * changes.
 *
 * **Data in, not children.** The compositional `SelectMenu` cannot be reused
 * for the page: its items read value and highlight off Radix context and
 * register with a trigger a page does not have. An option array is the one
 * shape both anchors can build from. Reach for `SelectMenu` directly when you
 * want the composition and only ever a dropdown.
 *
 * **One language per form.** A form where one field opens a page and the next
 * drops a menu down reads as two products. If any field here needs the page,
 * give every select in that form the same treatment — including the ones a
 * native `<select>` would have served.
 */
export const AdaptiveSelect: React.FC<AdaptiveSelectProps> = ({
  value,
  onValueChange,
  options,
  label,
  placeholder,
  disabled = false,
  id,
  className,
  onOpenPage,
}) => {
  const isPhone = useIsPhone();
  const groups = React.useMemo(() => groupOptions(options), [options]);
  const selected = options.find((option) => option.value === value);

  if (isPhone && onOpenPage) {
    return (
      /* Shaped like the dropdown trigger so a form row does not change height
         across the breakpoint — it just opens somewhere else. */
      <button
        type="button"
        id={id}
        className={cn('adaptive-select', className)}
        aria-label={label}
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={onOpenPage}
      >
        {selected?.leading != null && (
          <span className="adaptive-select-leading" aria-hidden="true">
            {selected.leading}
          </span>
        )}
        <span className="adaptive-select-value">
          {selected ? (
            selected.label
          ) : (
            <span className="is-placeholder">{placeholder}</span>
          )}
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
    );
  }

  return (
    <SelectMenu value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectMenuTrigger
        id={id}
        aria-label={label}
        leading={selected?.leading}
        className={className}
      >
        <SelectMenuValue placeholder={placeholder} />
      </SelectMenuTrigger>
      <SelectMenuContent>
        {groups.map((group) => (
          <SelectMenuGroup key={group.heading ?? '_'}>
            {group.heading && (
              <SelectMenuLabel>{group.heading}</SelectMenuLabel>
            )}
            {group.options.map((option) => (
              <SelectMenuItem
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                leading={option.leading}
                subline={option.subline}
              >
                {option.label}
              </SelectMenuItem>
            ))}
          </SelectMenuGroup>
        ))}
      </SelectMenuContent>
    </SelectMenu>
  );
};

export default AdaptiveSelect;
