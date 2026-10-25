import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { GetPetResponseDTO } from 'shared';
import { usePets } from '@/hooks/queries/petQueries';
import { isPetActive } from '@/lib/pets';
import { PetContext } from './PetContext';

const NO_PETS: GetPetResponseDTO[] = [];

export function PetProvider({ children }: { children: ReactNode }) {
  const { data: allPets = NO_PETS, isLoading, error } = usePets();
  const pets = useMemo(() => allPets.filter(isPetActive), [allPets]);
  const [selectedPet, setSelectedPet] = useState<GetPetResponseDTO | null>(
    null,
  );

  // Derive effective selection: user's choice if it is still offered (not
  // deleted or closed), otherwise first pet (or null). No effect needed—we
  // only setState on user action.
  const selectedStillExists =
    selectedPet && pets.some((p) => p.id === selectedPet.id);
  const effectiveSelectedPet = selectedStillExists
    ? selectedPet
    : (pets[0] ?? null);

  // Clear stale selection when the selected pet was deleted (state update during
  // render is allowed in React 18 when adjusting to props/state).
  if (selectedPet && !selectedStillExists) {
    setSelectedPet(null);
  }

  return (
    <PetContext.Provider
      value={{
        selectedPet: effectiveSelectedPet,
        setSelectedPet,
        pets,
        allPets,
        isLoading,
        error,
      }}
    >
      {children}
    </PetContext.Provider>
  );
}
