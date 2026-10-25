import type { GetPetResponseDTO } from 'shared';

type PetLifecycle = Pick<GetPetResponseDTO, 'id' | 'closed_at'>;

/** A closed profile leaves the switcher and every picker; it stays in Settings. */
export function isPetActive(
  pet: Pick<GetPetResponseDTO, 'closed_at'>,
): boolean {
  return pet.closed_at == null;
}

/**
 * A picker's pets: those `isPetActive` keeps, plus any already chosen, so an
 * existing assignment to a closed pet still shows instead of reading as blank.
 */
export function offerablePets<T extends PetLifecycle>(
  pets: readonly T[],
  chosen: Iterable<number | null | undefined> = [],
): T[] {
  const keep = new Set(chosen);
  return pets.filter((pet) => isPetActive(pet) || keep.has(pet.id));
}
