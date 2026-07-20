import { isRecord } from 'shared';
import { BowlType } from './constants.ts';


function getNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function getBowlType(control: unknown): number | undefined {
  if (!isRecord(control)) return undefined;
  const bowls = control.bowls;
  if (!isRecord(bowls)) return undefined;
  return getNumber(bowls.type);
}

/**
 * Maps SurePet device control + hardware bowl index to generic compartment id.
 */
export function resolveSurePetFoodCompartmentId(
  control: unknown,
  bowlIndex: number | undefined,
): string {
  const bowlType = getBowlType(control);
  if (bowlType === BowlType.TWO_SMALL && bowlIndex != null) {
    return String(bowlIndex);
  }
  return 'default';
}

export function shouldIncludeBowlIndexOnProviderData(control: unknown): boolean {
  return getBowlType(control) === BowlType.TWO_SMALL;
}
