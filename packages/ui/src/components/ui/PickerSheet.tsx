import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from './Dialog';
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
  className,
  children,
}) => {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn('picker-sheet', className)}
        placement="sheet"
        showCloseButton={false}
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
          <div className="picker-sheet-heading">
            <DialogTitle className="picker-sheet-title">{title}</DialogTitle>
            {subtitle != null && (
              <DialogDescription className="picker-sheet-subtitle">
                {subtitle}
              </DialogDescription>
            )}
          </div>
          {action}
        </div>
        <div className="picker-sheet-body">{children}</div>
      </DialogContent>
    </Dialog>
  );
};

export { PickerSheet, type PickerSheetProps };
