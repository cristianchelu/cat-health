import * as React from 'react';
import type { GetDeviceResponseDTO } from 'shared';
import SureFeederCardStatus from './surepet/SureFeederCardStatus';

export type DeviceCardStatusComponent = React.ComponentType<{
  device: GetDeviceResponseDTO;
}>;

interface DeviceCardStatusRegistration {
  id: string;
  provider?: string;
  type?: GetDeviceResponseDTO['type'];
  component: DeviceCardStatusComponent;
}

type DeviceCardStatusMatch = 'provider-type' | 'provider';

const cardStatusResolutionOrder: DeviceCardStatusMatch[] = [
  'provider-type',
  'provider',
];

const deviceCardStatusRegistry: DeviceCardStatusRegistration[] = [
  {
    id: 'surepet-feeder',
    provider: 'surepet',
    type: 'feeder',
    component: SureFeederCardStatus,
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
