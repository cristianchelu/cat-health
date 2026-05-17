import * as React from 'react';
import { cn } from '@/lib/utils';

import './DashboardTile.css';

export interface DashboardTileProps extends React.ComponentProps<'div'> {
  /** Max width cap for entity rows inside grid cells (px) */
  maxWidthPx?: number;
}

const DashboardTile = React.forwardRef<HTMLDivElement, DashboardTileProps>(
  ({ className, maxWidthPx = 400, style, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('dashboard-tile', className)}
        style={
          {
            '--dashboard-tile-max-width': `${maxWidthPx}px`,
            ...style,
          } as React.CSSProperties
        }
        {...props}
      />
    );
  },
);

DashboardTile.displayName = 'DashboardTile';

export { DashboardTile };
