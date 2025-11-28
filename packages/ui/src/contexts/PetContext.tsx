import { createContext } from 'react';
import type { GetPetResponseDTO } from 'shared';

interface PetContextType {
  selectedPet: GetPetResponseDTO | null;
  setSelectedPet: (pet: GetPetResponseDTO | null) => void;
  pets: GetPetResponseDTO[];
  isLoading: boolean;
  error: Error | null;
}

export const PetContext = createContext<PetContextType | undefined>(undefined);
