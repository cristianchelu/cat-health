import { PetContext } from '@/contexts/PetContext';
import { useContext } from 'react';

export function usePetContext() {
  const context = useContext(PetContext);
  if (context === undefined) {
    throw new Error('usePet must be used within a PetProvider');
  }
  return context;
}
