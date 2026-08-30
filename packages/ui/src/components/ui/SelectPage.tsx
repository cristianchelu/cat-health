import * as React from 'react';
import { cn } from '@/lib/utils';
import { PickerList } from './PickerList';
import { SheetPageHeader } from './SheetPageHeader';
import { type PickerOption } from './pickerOptions';
import './SelectPage.css';

export type { PickerOption };

export interface SelectPageProps {
  title: string;
  options: PickerOption[];
  value: string;
  onSelect: (value: string) => void;
  onBack: () => void;
  className?: string;
}

/**
 * Choosing one option, as a level of the sheet you are already in.
 *
 * The rows are the DS `PickerRow` — the same row the food ladder and the
 * settings lists use, so a list of cats and a list of foods are one list with
 * different contents, and a fix to one is a fix to both.
 *
 * Not its own dialog. A picker that opens a *second* sheet over the first
 * leaves two surfaces on screen at two different heights, and the seam between
 * them is the first thing you see. This replaces the host's content instead —
 * the drawer stays exactly where it was and only what is inside it changes,
 * which is the same ladder the food picker walks.
 *
 * Back walks out and choosing is the commit, so there is no commit row here:
 * whatever form owns the value still commits on its own Save.
 *
 * Renders a `DialogTitle`, so it must be mounted inside a `Dialog` — it is a
 * level of a sheet, never a standalone panel.
 */
export const SelectPage: React.FC<SelectPageProps> = ({
  title,
  options,
  value,
  onSelect,
  onBack,
  className,
}) => {
  return (
    <div className={cn('select-page', className)}>
      <SheetPageHeader
        className="select-page-header"
        title={title}
        onBack={onBack}
      />

      {/*
       * A radiogroup, not a listbox: these are rows on a page, and leaving the
       * page is what commits. There is no open/closed state for a screen
       * reader to track.
       */}
      <PickerList
        className="select-page-body"
        role="radiogroup"
        aria-label={title}
        optionRole="radio"
        options={options}
        value={value}
        onSelect={onSelect}
      />
    </div>
  );
};

export default SelectPage;
