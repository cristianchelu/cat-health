import type { DeviceType } from 'shared';

// Denylist on purpose: a new DeviceType defaults to "monitoring" (full tab
// set) until someone decides otherwise. Infrastructure roles are the
// exception, not the rule.
const NON_MONITORING_DEVICE_TYPES = new Set<DeviceType>(['camera']);

export function isMonitoringDevice(device: { type: DeviceType }): boolean {
  return !NON_MONITORING_DEVICE_TYPES.has(device.type);
}

export function filterMonitoringDevices<T extends { type: DeviceType }>(
  devices: readonly T[],
): T[] {
  return devices.filter(isMonitoringDevice);
}

/** A device carries two switches: its own, and the one on its account. */
export interface DeviceEnablement {
  enabled: boolean;
  account_enabled: boolean;
}

/** Which switch is holding a device down, for copy that has to name one. */
export type DeviceInactiveReason = 'device' | 'account';

/**
 * Why nothing can reach this device, or `null` when something can. A disabled
 * account is never initialized, so its devices cannot connect whatever their
 * own switch says — which is also why it outranks the device's own switch
 * here: turning the device back on would change nothing until the account is.
 */
export function deviceInactiveReason(
  device: DeviceEnablement,
): DeviceInactiveReason | null {
  if (!device.account_enabled) return 'account';
  if (!device.enabled) return 'device';
  return null;
}

/**
 * Whether anything can reach this device. Everything that hides, greys out, or
 * declines to offer a device asks this; only copy that has to name the switch
 * needs `deviceInactiveReason`.
 */
export function isDeviceActive(device: DeviceEnablement): boolean {
  return deviceInactiveReason(device) === null;
}

// Deliberately not folded into `isMonitoringDevice`: that one asks whether this
// *kind* of device belongs on the monitoring surface, and `deviceDetailsTabs`
// asks it again for a device you are already looking at, where the switch is
// beside the point.
export function isRosterDevice(
  device: { type: DeviceType } & DeviceEnablement,
): boolean {
  return isDeviceActive(device) && isMonitoringDevice(device);
}

export type RosterEmptyReason = 'none-owned' | 'all-switched-off';

export interface RosterPartition<T> {
  roster: T[];
  /** Why there is nothing to show, or `null` when there is. */
  emptyReason: RosterEmptyReason | null;
}

/**
 * Split a device list into what the roster shows and why it might show nothing.
 * The two answers come together because the reason depends on what was dropped:
 * an all-off roster renders identically to an empty one.
 */
export function partitionRoster<
  T extends { type: DeviceType } & DeviceEnablement,
>(devices: readonly T[]): RosterPartition<T> {
  const roster: T[] = [];
  let ownsMonitoringDevice = false;

  for (const device of devices) {
    if (!isMonitoringDevice(device)) continue;
    ownsMonitoringDevice = true;
    if (isDeviceActive(device)) roster.push(device);
  }

  if (roster.length > 0) return { roster, emptyReason: null };
  return {
    roster,
    emptyReason: ownsMonitoringDevice ? 'all-switched-off' : 'none-owned',
  };
}
