import * as React from 'react';
import type { DeviceType } from 'shared';
import { getDeviceIcon } from '@/components/icons/deviceIcons';
import { cn } from '@/lib/utils';
import './DeviceTypeTile.css';

interface DeviceTypeTileProps extends React.ComponentProps<'div'> {
  type: DeviceType;
  /** sm: list rows · md: listing · lg: form card header. */
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Rounded tile carrying a device type's icon — the device-side counterpart of
 * `ProviderBrandTile`, and decorative in exactly the same way: callers must
 * render the device name and type as real text themselves.
 *
 * The wash is mixed against the surface rather than using `--color-primary-light`
 * directly, because that token is a mid tone in dark mode and would leave the
 * icon sitting on near-solid primary.
 */
const DeviceTypeTile = React.forwardRef<HTMLDivElement, DeviceTypeTileProps>(
  ({ type, size = 'md', className, ...props }, ref) => (
    <div
      className={cn('device-type-tile', size, className)}
      aria-hidden="true"
      ref={ref}
      {...props}
    >
      {getDeviceIcon(type)}
    </div>
  ),
);

DeviceTypeTile.displayName = 'DeviceTypeTile';

export { DeviceTypeTile, type DeviceTypeTileProps };
