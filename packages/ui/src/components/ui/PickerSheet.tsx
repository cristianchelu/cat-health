import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DialogDescription, DialogTitle } from './Dialog';
import { Sheet } from './Sheet';
import { SheetPages } from './SheetPages';
import { Button } from './Button';
import './PickerSheet.css';

interface PickerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: React.ReactNode;
  /**
   * Walks up one level, or closes at the top — which of the two is the
   * caller's business, since only it knows how deep the stack is.
   */
  onBack: () => void;
  /** One action opposite the title, such as scan-to-log. */
  action?: React.ReactNode;
  /**
   * Identity of the level on screen. Providing it turns on page slides —
   * a sheet with only one level has nothing to slide between and should
   * leave it off.
   */
  pageKey?: string;
  /** Rung of the ladder, e.g. `stack.length - 1`. Defaults to 0. */
  pageDepth?: number;
  className?: string;
  children: React.ReactNode;
}

/**
 * A sheet you choose something in: back, what you are looking at, and one
 * scroller under a header that stays put.
 *
 * Shared so that two pickers cannot drift into two different headers, two
 * type scales and two ideas of where a list's edges are. There is no close
 * button and no commit row — back walks out, and choosing is the commit.
 */
const PickerSheet: React.FC<PickerSheetProps> = ({
  open,
  onOpenChange,
  title,
  subtitle,
  onBack,
  action,
  pageKey,
  pageDepth,
  className,
  children,
}) => {
  const { t } = useTranslation();

  const body = <div className="picker-sheet-body">{children}</div>;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      className={cn('picker-sheet', className)}
    >
      <div className="picker-sheet-header">
        <Button
          variant="ghost"
          icon
          onClick={onBack}
          aria-label={t('common.back')}
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
        {/* Keyed, so the incoming level's text simply replaces the old and
            fades in. A true crossfade would need two headings mounted at once
            for one line of text; at 150ms the eye cannot tell. */}
        <div key={pageKey ?? 'static'} className="picker-sheet-heading">
          <DialogTitle className="picker-sheet-title">{title}</DialogTitle>
          {subtitle != null && (
            <DialogDescription className="picker-sheet-subtitle">
              {subtitle}
            </DialogDescription>
          )}
        </div>
        {action}
      </div>
      {pageKey != null ? (
        <SheetPages
          page={pageKey}
          depth={pageDepth ?? 0}
          className="picker-sheet-pages"
        >
          {body}
        </SheetPages>
      ) : (
        body
      )}
    </Sheet>
  );
};

export { PickerSheet, type PickerSheetProps };
