import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { GetPetResponseDTO } from 'shared';
import { usePets } from '@/hooks/queries/petQueries';
import { PetContext } from './PetContext';

export function PetProvider({ children }: { children: ReactNode }) {
  const { data: pets = [], isLoading, error } = usePets();
  const [selectedPet, setSelectedPet] = useState<GetPetResponseDTO | null>(
    null,
  );

  // Auto-select first pet when:
  // 1. No pet is currently selected
  // 2. Pets have loaded successfully
  // 3. There is at least one pet available
  useEffect(() => {
    if (!selectedPet && !isLoading && pets.length > 0) {
      setSelectedPet(pets[0]);
    }
  }, [selectedPet, isLoading, pets]);

  // Handle case where selected pet is deleted
  useEffect(() => {
    if (selectedPet && pets.length > 0) {
      const petStillExists = pets.some((pet) => pet.id === selectedPet.id);
      if (!petStillExists) {
        // Selected pet was deleted, select first available pet
        setSelectedPet(pets[0]);
      }
    } else if (selectedPet && pets.length === 0) {
      // All pets were deleted
      setSelectedPet(null);
    }
  }, [selectedPet, pets]);

  return (
    <PetContext.Provider
      value={{
        selectedPet,
        setSelectedPet,
        pets,
        isLoading,
        error,
      }}
    >
      {children}
    </PetContext.Provider>
  );
}
