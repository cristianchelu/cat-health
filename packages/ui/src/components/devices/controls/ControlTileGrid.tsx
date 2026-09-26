import * as React from 'react';
import type { ControlValueType } from 'shared';
import { DashboardTile } from '@/components/layout/DashboardTile';
import { ResponsiveTileGrid } from '@/components/layout/ResponsiveTileGrid';
import type { ControlDraftValue } from '@/lib/deviceControlDraft';
import { cn } from '@/lib/utils';
import { ControlTile } from './ControlTile';
import './ControlTileGrid.css';

interface ControlTileGridItem {
  key: string;
  label: string;
  type: ControlValueType;
  value: ControlDraftValue;
  disabled?: boolean;
  note?: string;
  error?: string;
}

interface ControlTileGridProps {
  items: ControlTileGridItem[];
  onChange: (key: string, value: ControlDraftValue) => void;
  onCommit?: (key: string) => void;
  className?: string;
}

/** Device settings as tiles, on the same grid as the device's readings. */
const ControlTileGrid: React.FC<ControlTileGridProps> = ({
  items,
  onChange,
  onCommit,
  className,
}) => (
  <ResponsiveTileGrid className={cn('control-tile-grid', className)}>
    {items.map((item) => (
      <DashboardTile key={item.key}>
        <ControlTile
          label={item.label}
          type={item.type}
          value={item.value}
          onChange={(value) => onChange(item.key, value)}
          onCommit={onCommit ? () => onCommit(item.key) : undefined}
          disabled={item.disabled}
          note={item.note}
          error={item.error}
        />
      </DashboardTile>
    ))}
  </ResponsiveTileGrid>
);

export { ControlTileGrid, type ControlTileGridItem, type ControlTileGridProps };
