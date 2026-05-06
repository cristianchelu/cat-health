import * as React from 'react';
import type { GetDeviceResponseDTO, EntityDTO } from 'shared';
import { resolveDevicePage } from './devicePageRegistry';

interface ProviderDeviceViewProps {
  device: GetDeviceResponseDTO;
}

export const ProviderDeviceView: React.FC<ProviderDeviceViewProps> = ({
  device,
}) => {
  // Check if device has entities in state
  const state = device.state as Record<string, unknown> | undefined;
  const entities = state?.entities as EntityDTO[] | undefined;
  const sensors = state?.sensors as Record<string, unknown> | undefined;
  const DevicePage = resolveDevicePage(device);

  return <DevicePage device={device} entities={entities} sensors={sensors} />;
};
