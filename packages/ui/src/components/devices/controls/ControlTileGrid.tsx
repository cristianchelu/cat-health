import * as React from 'react';
import { ResponsiveTileGrid } from '@/components/layout/ResponsiveTileGrid';
import { cn } from '@/lib/utils';
import { ControlTiles, type ControlTilesProps } from './ControlTiles';
import './ControlTileGrid.css';

interface ControlTileGridProps extends ControlTilesProps {
  className?: string;
}

/** Device settings as tiles, on the same grid as the device's readings. */
const ControlTileGrid: React.FC<ControlTileGridProps> = ({
  className,
  ...tiles
}) => (
  <ResponsiveTileGrid className={cn('control-tile-grid', className)}>
    <ControlTiles {...tiles} />
  </ResponsiveTileGrid>
);

export { ControlTileGrid, type ControlTileGridProps };
