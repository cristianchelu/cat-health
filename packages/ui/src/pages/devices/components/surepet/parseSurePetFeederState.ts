import type { SureFeederState } from 'shared';
import { parseWithSchema, SurePetDeviceStateSchema } from 'shared';

export function parseSurePetFeederState(
  state: unknown,
): SureFeederState | undefined {
  return parseWithSchema(SurePetDeviceStateSchema, state);
}
