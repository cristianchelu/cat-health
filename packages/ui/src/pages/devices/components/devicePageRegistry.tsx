import * as React from 'react';
import type { EntityDTO, GetDeviceResponseDTO } from 'shared';
import { getStringValue, isRecord } from '@/lib/utils';
import { ESPHomeView } from './ESPHomeView';
import { SureFeederView } from './SureFeederView';
import { parseSurePetFeederState } from './surepet/parseSurePetFeederState';

export interface DevicePageContext {
  device: GetDeviceResponseDTO;
  entities?: EntityDTO[];
  sensors?: Record<string, unknown>;
}

export type DevicePageComponent = React.ComponentType<DevicePageContext>;

interface DevicePageRegistration {
  id: string;
  provider?: string;
  model?: string;
  type?: GetDeviceResponseDTO['type'];
  component: DevicePageComponent;
}

type DevicePageMatch =
  | 'provider-model'
  | 'provider-type'
  | 'provider'
  | 'type';

const ESPHOME_WATER_BOWL_MODEL = 'CristianChelu.PetBowlMonitor';
const PETLIBRO_FOUNTAIN_MODEL = 'Petlibro.PLWF105';
const pageResolutionOrder: DevicePageMatch[] = [
  'provider-model',
  'provider-type',
  'provider',
  'type',
];

const getDeviceConfig = (
  device: GetDeviceResponseDTO,
): Record<string, unknown> | undefined => {
  return isRecord(device.config) ? device.config : undefined;
};

export const getDeviceModel = (device: GetDeviceResponseDTO): string | undefined => {
  const config = getDeviceConfig(device);

  if (!config) {
    return undefined;
  }

  return getStringValue(config, 'projectName') ?? getStringValue(config, 'project_name');
};

const GenericDeviceFallback: DevicePageComponent = ({ device }) => (
  <div>No provider view available for {device.provider}</div>
);

const ESPHomeDevicePage: DevicePageComponent = ({ entities, sensors }) => {
  return <ESPHomeView entities={entities ?? []} sensors={sensors} />;
};

const SureFeederDevicePage: DevicePageComponent = ({ device }) => {
  const state = parseSurePetFeederState(device.state);
  return <SureFeederView state={state} />;
};

const devicePageRegistry: DevicePageRegistration[] = [
  {
    id: 'esphome-water-bowl-model',
    provider: 'esphome',
    model: ESPHOME_WATER_BOWL_MODEL,
    component: ESPHomeDevicePage,
  },
  {
    id: 'esphome-petlibro-fountain-model',
    provider: 'esphome',
    model: PETLIBRO_FOUNTAIN_MODEL,
    component: ESPHomeDevicePage,
  },
  {
    id: 'esphome-water-fountain-type',
    provider: 'esphome',
    type: 'water_fountain',
    component: ESPHomeDevicePage,
  },
  {
    id: 'esphome-provider-fallback',
    provider: 'esphome',
    component: ESPHomeDevicePage,
  },
  {
    id: 'surepet-feeder',
    provider: 'surepet',
    type: 'feeder',
    component: SureFeederDevicePage,
  },
];

const registrationMatchesDevice = (
  registration: DevicePageRegistration,
  device: GetDeviceResponseDTO,
  model: string | undefined,
): boolean => {
  if (registration.provider && registration.provider !== device.provider) {
    return false;
  }

  if (registration.model && registration.model !== model) {
    return false;
  }

  if (registration.type && registration.type !== device.type) {
    return false;
  }

  return true;
};

const registrationMatchesResolutionStep = (
  registration: DevicePageRegistration,
  match: DevicePageMatch,
): boolean => {
  switch (match) {
    case 'provider-model':
      return Boolean(registration.provider && registration.model);
    case 'provider-type':
      return Boolean(registration.provider && registration.type && !registration.model);
    case 'provider':
      return Boolean(registration.provider && !registration.model && !registration.type);
    case 'type':
      return Boolean(registration.type && !registration.provider && !registration.model);
  }
};

export const resolveDevicePage = (device: GetDeviceResponseDTO): DevicePageComponent => {
  const model = getDeviceModel(device);

  for (const match of pageResolutionOrder) {
    const registration = devicePageRegistry.find((candidate) => {
      return (
        registrationMatchesDevice(candidate, device, model) &&
        registrationMatchesResolutionStep(candidate, match)
      );
    });

    if (registration) {
      return registration.component;
    }
  }

  return GenericDeviceFallback;
};
