import { createContext } from 'react';
import type { GetPetResponseDTO } from 'shared';

interface PetContextType {
  selectedPet: GetPetResponseDTO | null;
  setSelectedPet: (pet: GetPetResponseDTO | null) => void;
  /** The pets `isPetActive` keeps: what the switcher and Overview offer. */
  pets: GetPetResponseDTO[];
  /** Every pet, closed profiles included, for Settings. */
  allPets: GetPetResponseDTO[];
  isLoading: boolean;
  error: Error | null;
}

export const PetContext = createContext<PetContextType | undefined>(undefined);
