import * as React from 'react';
import type { GetDeviceResponseDTO, EntityDTO } from 'shared';
import { ESPHomeView } from './ESPHomeView';

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

  if (device.provider === 'esphome' && entities) {
    return <ESPHomeView entities={entities} sensors={sensors} />;
  }

  // Fallback or other providers
  return <div>No provider view available for {device.provider}</div>;
};
