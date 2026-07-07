import type { SureFeederState } from 'shared';
import { isRecord } from '@/lib/utils';

export function parseSurePetFeederState(
  state: unknown,
): SureFeederState | undefined {
  if (!isRecord(state) || state.provider !== 'surepet') {
    return undefined;
  }
  const feederState = { ...state };
  delete feederState.provider;
  if (!Array.isArray(feederState.bowl_status)) {
    return undefined;
  }
  return feederState as SureFeederState;
}
