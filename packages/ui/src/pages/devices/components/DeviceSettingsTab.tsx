import * as React from 'react';
import type { GetDeviceResponseDTO } from 'shared';
import { DeviceSettingsForm } from '@/components/devices/controls/DeviceSettingsForm';
import { deviceConfigSettings } from '@/lib/deviceDetailsTabs';

interface DeviceSettingsTabProps {
  device: GetDeviceResponseDTO;
  onDirtyChange?: (dirty: boolean) => void;
}

/** The Settings tab of a device whose only settings are the device's own. */
const DeviceSettingsTab: React.FC<DeviceSettingsTabProps> = ({
  device,
  onDirtyChange,
}) => (
  <DeviceSettingsForm
    deviceId={device.id}
    settings={deviceConfigSettings(device)}
    onDirtyChange={onDirtyChange}
  />
);

export default DeviceSettingsTab;
