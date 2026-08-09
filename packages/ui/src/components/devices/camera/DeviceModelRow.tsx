import * as React from 'react';
import { cn } from '@/lib/utils';
import './DeviceModelRow.css';

interface DeviceModelRowProps extends Omit<
  React.ComponentProps<'div'>,
  'title'
> {
  leading?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}

/**
 * A single "this is the linked model" row: leading icon/thumbnail, title,
 * optional subtitle, and a trailing action (e.g. Change). Shared between the
 * Camera tab source row and the Recognition tab's linked-model row.
 */
const DeviceModelRow = React.forwardRef<HTMLDivElement, DeviceModelRowProps>(
  ({ className, leading, title, subtitle, action, ...props }, ref) => {
    return (
      <div className={cn('device-model-row', className)} ref={ref} {...props}>
        {leading && <div className="device-model-row-leading">{leading}</div>}
        <div className="device-model-row-body">
          <div className="device-model-row-title">{title}</div>
          {subtitle && (
            <div className="device-model-row-subtitle">{subtitle}</div>
          )}
        </div>
        {action && <div className="device-model-row-action">{action}</div>}
      </div>
    );
  },
);

DeviceModelRow.displayName = 'DeviceModelRow';

interface DeviceModelRowTileProps extends React.ComponentProps<'div'> {
  variant?: 'muted' | 'primary-lightest';
}

/**
 * The 34x34 leading icon tile for `DeviceModelRow`. `muted` is the default
 * (a plain surface behind a primary-colored icon); `primary-lightest` is
 * used where the row itself is the primary subject of its card (e.g. the
 * Recognition tab's model row).
 */
const DeviceModelRowTile = React.forwardRef<
  HTMLDivElement,
  DeviceModelRowTileProps
>(({ className, variant = 'muted', children, ...props }, ref) => {
  return (
    <div
      className={cn('device-model-row-tile', variant, className)}
      ref={ref}
      {...props}
    >
      {children}
    </div>
  );
});

DeviceModelRowTile.displayName = 'DeviceModelRowTile';

export {
  DeviceModelRow,
  DeviceModelRowTile,
  type DeviceModelRowProps,
  type DeviceModelRowTileProps,
};
