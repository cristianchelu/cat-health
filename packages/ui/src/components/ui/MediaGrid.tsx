import * as React from 'react';
import { cn } from '@/lib/utils';
import './MediaGrid.css';

interface MediaGridProps extends React.ComponentProps<'div'> {
  /**
   * Smallest a tile may get before the grid drops a column. `md` is a picker
   * the user is reading faces in; `sm` is a strip of what was already chosen.
   */
  size?: 'sm' | 'md';
}

/**
 * An auto-filling grid of square media tiles.
 *
 * Only the track sizing lives here — a tile is a `MediaTile` and can appear
 * without this grid, which is why the two are separate components rather than
 * one file with a nested selector.
 */
const MediaGrid = React.forwardRef<HTMLDivElement, MediaGridProps>(
  ({ size = 'md', className, ...props }, ref) => (
    <div className={cn('media-grid', size, className)} ref={ref} {...props} />
  ),
);

MediaGrid.displayName = 'MediaGrid';

export { MediaGrid, type MediaGridProps };
