import * as React from 'react';
import { cn } from '@/lib/utils';
import { SheetPageHeader } from './SheetPageHeader';
import './SheetPageFrame.css';

export interface SheetPageFrameProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onBack: () => void;
  /** Buttons on the trailing edge, level with the title. */
  actions?: React.ReactNode;
  className?: string;
  /** The page's one scroller — rows, a list, whatever the level holds. */
  children: React.ReactNode;
}

/**
 * The frame of a page inside a sheet: a back header pinned on top, one
 * scroller under it, rows running edge to edge with the inset put back per
 * row (`--picker-row-inline`).
 *
 * One owner for the shape so two pages cannot drift into two headers, two
 * scroll behaviors and two ideas of where a list's edges are — `SelectPage`
 * and the food ladder's `FoodBrowsePage` are this frame with different
 * contents. Hosts mount pages in an unpadded box (the host's own pages bring
 * their padding); a padded host would need to bleed the frame out itself.
 *
 * Renders a `DialogTitle` via its header, so it must be mounted inside a
 * `Dialog` — it is a level of a sheet, never a standalone panel.
 */
export const SheetPageFrame: React.FC<SheetPageFrameProps> = ({
  title,
  subtitle,
  onBack,
  actions,
  className,
  children,
}) => (
  <div className={cn('sheet-page-frame', className)}>
    <SheetPageHeader
      className="sheet-page-frame-header"
      title={title}
      subtitle={subtitle}
      onBack={onBack}
      actions={actions}
    />
    <div className="sheet-page-frame-body">{children}</div>
  </div>
);

export default SheetPageFrame;
