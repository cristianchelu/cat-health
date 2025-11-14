import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import type { GetPetResponseDTO } from 'shared';

interface PetContextType {
  selectedPet: GetPetResponseDTO | null;
  setSelectedPet: (pet: GetPetResponseDTO | null) => void;
}

const PetContext = createContext<PetContextType | undefined>(undefined);

export function PetProvider({ children }: { children: ReactNode }) {
  const [selectedPet, setSelectedPet] = useState<GetPetResponseDTO | null>(
    null,
  );

  return (
    <PetContext.Provider
      value={{
        selectedPet,
        setSelectedPet,
      }}
    >
      {children}
    </PetContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePet() {
  const context = useContext(PetContext);
  if (context === undefined) {
    throw new Error('usePet must be used within a PetProvider');
  }
  return context;
}
