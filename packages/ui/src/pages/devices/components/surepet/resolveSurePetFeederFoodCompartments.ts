import type { GetDeviceResponseDTO } from 'shared';
import type { FeederFoodCompartmentDescriptor } from '../feederFoodCompartmentsRegistry';
import { parseSurePetFeederState } from './parseSurePetFeederState';

const TWO_SMALL_BOWL_TYPE = 4;

export function resolveSurePetFeederFoodCompartments(
  device: GetDeviceResponseDTO,
): FeederFoodCompartmentDescriptor[] {
  const state = parseSurePetFeederState(device.state);

  if (state?.bowl_type === TWO_SMALL_BOWL_TYPE) {
    return [
      { id: '0', labelKey: 'devices.feeder.bowl_left' },
      { id: '1', labelKey: 'devices.feeder.bowl_right' },
    ];
  }

  return [{ id: 'default', labelKey: 'devices.feeder.food_compartment_default' }];
}
