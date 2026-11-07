import type { PetAlteredDTO } from '../schemas/api/pets.ts';

export const ENERGY_STAGES = [
  'growth',
  'adult_neutered',
  'adult_intact',
] as const;
export type EnergyStage = (typeof ENERGY_STAGES)[number];

/** Growth ends at 12 months, where FEDIAF's kitten table (VII-10) ends. */
export const GROWTH_UNTIL_MONTHS = 12;

/** Whole calendar months from `birthDate` to `on`, both `yyyy-MM-dd`. */
export function ageInMonths(birthDate: string, on: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [oy, om, od] = on.split('-').map(Number);
  const months = (oy - by) * 12 + (om - bm);
  return od < bd ? months - 1 : months;
}

export interface EnergyStageInput {
  birthDate: string | null;
  altered: PetAlteredDTO;
}

/**
 * A cat with no birth date is an adult, and one whose neutering is unknown is
 * treated as neutered. There is no senior stage: see `docs/nutrition-sources.md`.
 */
export function energyStageOf(pet: EnergyStageInput, on: string): EnergyStage {
  if (pet.birthDate && ageInMonths(pet.birthDate, on) < GROWTH_UNTIL_MONTHS) {
    return 'growth';
  }
  if (pet.altered === 'intact') return 'adult_intact';
  return 'adult_neutered';
}
