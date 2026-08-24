import * as React from 'react';
import type { GetDeviceResponseDTO, EntityDTO } from 'shared';
import { resolveDevicePage } from './devicePageRegistry';

interface ProviderDeviceViewProps {
  device: GetDeviceResponseDTO;
  onDirtyChange?: (dirty: boolean) => void;
}

export const ProviderDeviceView: React.FC<ProviderDeviceViewProps> = ({
  device,
  onDirtyChange,
}) => {
  const state = device.state as Record<string, unknown> | undefined;
  const entities = state?.entities as EntityDTO[] | undefined;
  const sensors = state?.sensors as Record<string, unknown> | undefined;

  return React.createElement(resolveDevicePage(device), {
    device,
    entities,
    sensors,
    onDirtyChange,
  });
};
