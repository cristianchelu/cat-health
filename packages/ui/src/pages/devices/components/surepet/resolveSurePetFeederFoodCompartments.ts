import {
  parseWithSchema,
  SurePetDeviceStateSchema,
  type GetDeviceResponseDTO,
} from 'shared';
import type { FeederFoodCompartmentDescriptor } from '../feederFoodCompartmentsRegistry';
import { SUREPET_BOWL_TYPE_TWO_SMALL } from './surePetConstants';

export function resolveSurePetFeederFoodCompartments(
  device: GetDeviceResponseDTO,
): FeederFoodCompartmentDescriptor[] {
  const state = parseWithSchema(SurePetDeviceStateSchema, device.state);

  if (state?.bowl_type === SUREPET_BOWL_TYPE_TWO_SMALL) {
    return [
      { id: '0', labelKey: 'devices.feeder.bowl_left' },
      { id: '1', labelKey: 'devices.feeder.bowl_right' },
    ];
  }

  return [
    { id: 'default', labelKey: 'devices.feeder.food_compartment_default' },
  ];
}
