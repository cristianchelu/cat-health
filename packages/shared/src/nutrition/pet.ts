import type { PetAlteredDTO } from '../schemas/api/pets.ts';

/** Altered or intact, as the models see it; the record's `unknown` is settled by `alteredOf`. */
export type Altered = Exclude<PetAlteredDTO, 'unknown'>;

/**
 * The cat as the models see her on one day. Build it with `intakePetOf`.
 *
 * TODO(design): maintenance and water are computed at her current weight,
 * which holds an overweight cat where she is. Using her ideal weight needs a
 * way to know it (growth, breed, body measurements) that does not depend on
 * the owner supplying a number.
 */
export interface IntakePet {
  /** Whole months of age; null when her birth date is unknown. */
  ageMonths: number | null;
  altered: Altered;
  /** Her weight that day. */
  kg: number;
  /**
   * Her ideal weight as set, or null when none is. It stands as her weight
   * moves, past it included, and has no lower bound because `aaha-2014` gives
   * none; "Target weight" in `docs/nutrition-sources.md` has the reading.
   */
  targetKg: number | null;
}

/** What `intakePetOf` reads: the pet record's own fields, with her weight and target weight for the day. */
export interface IntakePetInput {
  birthDate: string | null;
  altered: PetAlteredDTO;
  kg: number;
  targetKg: number | null;
}

/** Her profile, weight and target weight on `on` (`yyyy-MM-dd`), as the models read them. */
export function intakePetOf(input: IntakePetInput, on: string): IntakePet {
  const ageMonths = input.birthDate ? ageInMonths(input.birthDate, on) : null;
  return {
    ageMonths,
    altered: alteredOf(input.altered),
    kg: input.kg,
    targetKg: input.targetKg,
  };
}

/** Whole calendar months from `birthDate` to `on`, both `yyyy-MM-dd`. */
export function ageInMonths(birthDate: string, on: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [oy, om, od] = on.split('-').map(Number);
  const months = (oy - by) * 12 + (om - bm);
  return od < bd ? months - 1 : months;
}

/** A cat not known to be intact is treated as altered. */
export function alteredOf(altered: PetAlteredDTO): Altered {
  if (altered === 'intact') return 'intact';
  return 'altered';
}
