import type { DeviceControlsDTO, DeviceType, SettingControl } from 'shared';

import { isMonitoringDevice } from './deviceMonitoring.ts';

export type DeviceDetailsTabId =
  | 'overview'
  | 'history'
  | 'camera'
  | 'recognition'
  | 'settings';

const OVERVIEW_HISTORY: DeviceDetailsTabId[] = ['overview', 'history'];

const ACTIVITY_PEER_TABS: DeviceDetailsTabId[] = ['camera', 'recognition'];

/** Settings that configure the device, which the Settings tab edits. */
export function deviceConfigSettings(device: {
  controls?: DeviceControlsDTO;
}): SettingControl[] {
  return (
    device.controls?.settings.filter(
      (setting) => setting.placement === 'setting',
    ) ?? []
  );
}

export function getDeviceDetailsTabs(device: {
  type: DeviceType;
  controls?: DeviceControlsDTO;
}): DeviceDetailsTabId[] {
  if (device.type === 'camera') {
    return [...OVERVIEW_HISTORY];
  }

  if (isMonitoringDevice(device)) {
    const tabs: DeviceDetailsTabId[] = [
      ...OVERVIEW_HISTORY,
      ...ACTIVITY_PEER_TABS,
    ];
    if (device.type === 'feeder' || deviceConfigSettings(device).length > 0) {
      tabs.push('settings');
    }
    return tabs;
  }

  return [...OVERVIEW_HISTORY];
}
