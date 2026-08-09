import type { DeviceType } from 'shared';

// Denylist on purpose: a new DeviceType defaults to "monitoring" (full tab
// set) until someone decides otherwise. Infrastructure roles are the
// exception, not the rule.
const NON_MONITORING_DEVICE_TYPES = new Set<DeviceType>([
  'camera',
  'pet_recognizer',
]);

export function isMonitoringDevice(device: { type: DeviceType }): boolean {
  return !NON_MONITORING_DEVICE_TYPES.has(device.type);
}

export function filterMonitoringDevices<T extends { type: DeviceType }>(
  devices: readonly T[],
): T[] {
  return devices.filter(isMonitoringDevice);
}
