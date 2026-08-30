import type { DeviceType } from 'shared';

import { isMonitoringDevice } from './deviceMonitoring.ts';

export type DeviceDetailsTabId =
  | 'overview'
  | 'history'
  | 'camera'
  | 'recognition'
  | 'settings';

const OVERVIEW_HISTORY: DeviceDetailsTabId[] = ['overview', 'history'];

const ACTIVITY_PEER_TABS: DeviceDetailsTabId[] = ['camera', 'recognition'];

export function getDeviceDetailsTabs(device: {
  type: DeviceType;
}): DeviceDetailsTabId[] {
  if (device.type === 'camera') {
    return [...OVERVIEW_HISTORY];
  }

  if (isMonitoringDevice(device)) {
    const tabs: DeviceDetailsTabId[] = [
      ...OVERVIEW_HISTORY,
      ...ACTIVITY_PEER_TABS,
    ];
    if (device.type === 'feeder') {
      tabs.push('settings');
    }
    return tabs;
  }

  return [...OVERVIEW_HISTORY];
}
