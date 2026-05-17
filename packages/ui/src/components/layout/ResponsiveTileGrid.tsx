import * as React from 'react';
import { cn } from '@/lib/utils';

import './ResponsiveTileGrid.css';

export interface ResponsiveTileGridProps extends React.ComponentProps<'div'> {
  /** Minimum column width in px before wrapping to fewer columns */
  minColumnPx?: number;
}

const ResponsiveTileGrid = React.forwardRef<
  HTMLDivElement,
  ResponsiveTileGridProps
>(({ className, minColumnPx = 280, style, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn('responsive-tile-grid', className)}
      style={
        {
          '--responsive-tile-grid-min': `${minColumnPx}px`,
          ...style,
        } as React.CSSProperties
      }
      {...props}
    />
  );
});

ResponsiveTileGrid.displayName = 'ResponsiveTileGrid';

export { ResponsiveTileGrid };
