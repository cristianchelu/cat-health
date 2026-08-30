import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './Button';
import { DialogTitle } from './Dialog';
import './SheetPageHeader.css';

export interface SheetPageHeaderProps {
  title: React.ReactNode;
  /** What this page is of — the event it details, the field it picks for. */
  subtitle?: React.ReactNode;
  onBack: () => void;
  /** Buttons on the trailing edge, level with the title. */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * The top of a page you walked into: back out, and what you walked into.
 *
 * Structure and type only — where it sits and whether it draws a rule under
 * itself belong to the page, which knows whether it is inside the sheet's
 * padding or backed out of it.
 *
 * Renders a `DialogTitle`, so it must be mounted inside a `Dialog`. Back is
 * the only dismissal it offers: a level of a sheet is left by walking out of
 * it, and the sheet itself is closed by the grabber or the scrim.
 */
export const SheetPageHeader: React.FC<SheetPageHeaderProps> = ({
  title,
  subtitle,
  onBack,
  actions,
  className,
}) => {
  const { t } = useTranslation();

  return (
    <div className={cn('sheet-page-header', className)}>
      <Button
        type="button"
        variant="ghost"
        icon
        onClick={onBack}
        aria-label={t('common.back')}
      >
        <ChevronLeft aria-hidden />
      </Button>
      <div className="sheet-page-header-identity">
        <DialogTitle className="sheet-page-header-title">{title}</DialogTitle>
        {subtitle != null && (
          <div className="sheet-page-header-subtitle">{subtitle}</div>
        )}
      </div>
      {actions != null && (
        <div className="sheet-page-header-actions">{actions}</div>
      )}
    </div>
  );
};

export default SheetPageHeader;
