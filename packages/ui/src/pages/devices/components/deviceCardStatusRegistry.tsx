import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  parseWithSchema,
  WaterFountainStateSchema,
  type GetDeviceResponseDTO,
} from 'shared';
import SureFeederCardStatus from './surepet/SureFeederCardStatus';
import WaterFountainStatus from './WaterFountainStatus';

export type DeviceCardStatusComponent = React.ComponentType<{
  device: GetDeviceResponseDTO;
}>;

interface DeviceCardStatusRegistration {
  id: string;
  provider?: string;
  type?: GetDeviceResponseDTO['type'];
  component: DeviceCardStatusComponent;
}

type DeviceCardStatusMatch = 'provider-type' | 'provider' | 'type';

const cardStatusResolutionOrder: DeviceCardStatusMatch[] = [
  'provider-type',
  'provider',
  'type',
];

const WaterFountainCardStatus: DeviceCardStatusComponent = ({ device }) => {
  const { t } = useTranslation();
  const state = parseWithSchema(WaterFountainStateSchema, device.state);
  return state ? (
    <WaterFountainStatus state={state} />
  ) : (
    <div className="no-status-data">{t('devices.no_status_data')}</div>
  );
};

const deviceCardStatusRegistry: DeviceCardStatusRegistration[] = [
  {
    id: 'surepet-feeder',
    provider: 'surepet',
    type: 'feeder',
    component: SureFeederCardStatus,
  },
  {
    id: 'water-fountain',
    type: 'water_fountain',
    component: WaterFountainCardStatus,
  },
];

const registrationMatchesDevice = (
  registration: DeviceCardStatusRegistration,
  device: GetDeviceResponseDTO,
): boolean => {
  if (registration.provider && registration.provider !== device.provider) {
    return false;
  }
  if (registration.type && registration.type !== device.type) {
    return false;
  }
  return true;
};

const registrationMatchesResolutionStep = (
  registration: DeviceCardStatusRegistration,
  match: DeviceCardStatusMatch,
): boolean => {
  switch (match) {
    case 'provider-type':
      return Boolean(registration.provider && registration.type);
    case 'provider':
      return Boolean(registration.provider && !registration.type);
    case 'type':
      return Boolean(!registration.provider && registration.type);
  }
};

export function resolveDeviceCardStatus(
  device: GetDeviceResponseDTO,
): DeviceCardStatusComponent | null {
  for (const match of cardStatusResolutionOrder) {
    const registration = deviceCardStatusRegistry.find((candidate) => {
      return (
        registrationMatchesDevice(candidate, device) &&
        registrationMatchesResolutionStep(candidate, match)
      );
    });

    if (registration) {
      return registration.component;
    }
  }

  return null;
}
