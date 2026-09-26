import * as React from 'react';
import { DashboardTile } from '@/components/layout/DashboardTile';
import type { ControlDraftValue } from '@/lib/deviceControlDraft';
import type { ResolvedControlType } from '@/lib/deviceControlLabels';
import { ControlTile } from './ControlTile';

interface ControlTileItem {
  key: string;
  label: string;
  type: ResolvedControlType;
  value: ControlDraftValue;
  disabled?: boolean;
  /** Set while a write is in flight; what a screen reader hears. */
  busyLabel?: string;
  error?: string;
}

interface ControlTilesProps {
  items: ControlTileItem[];
  onChange: (key: string, value: ControlDraftValue) => void;
  onCommit?: (key: string) => void;
}

/** Device settings as grid cells, for a grid the caller owns. */
const ControlTiles: React.FC<ControlTilesProps> = ({
  items,
  onChange,
  onCommit,
}) =>
  items.map((item) => (
    <DashboardTile key={item.key}>
      <ControlTile
        label={item.label}
        type={item.type}
        value={item.value}
        onChange={(value) => onChange(item.key, value)}
        onCommit={onCommit ? () => onCommit(item.key) : undefined}
        disabled={item.disabled}
        busyLabel={item.busyLabel}
        error={item.error}
      />
    </DashboardTile>
  ));

export { ControlTiles, type ControlTileItem, type ControlTilesProps };
