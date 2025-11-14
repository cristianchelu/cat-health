import React from 'react';
import { usePets } from '@/hooks/queries/petQueries';
import { usePet } from '@/contexts/PetContext';
import { cn } from '@/lib/utils';

import { Button } from '../ui/Button';
import { Cat } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';

import './PetSelector.css';

interface PetSelectorProps {
  variant?: 'desktop' | 'mobile';
}

const PetSelector: React.FC<PetSelectorProps> = ({ variant = 'desktop' }) => {
  const { data: pets, isLoading, error } = usePets();
  const { selectedPet, setSelectedPet } = usePet();

  if (isLoading) {
    return (
      <div className={cn('pet-selector', variant)}>
        <div className="loading">Loading pets...</div>
      </div>
    );
  }

  if (error || !pets) {
    return (
      <div className={cn('pet-selector', variant)}>
        <div className="error">Error loading pets</div>
      </div>
    );
  }

  if (pets.length === 0) {
    return (
      <div className={cn('pet-selector', variant)}>
        <div className="empty">No pets found</div>
      </div>
    );
  }

  // Avatar now handled by shared Avatar component.

  return (
    <ul className={cn('pet-selector', variant)}>
      {pets.map((pet) => (
        <Button
          key={pet.id}
          variant="ghost"
          className={cn('item', selectedPet?.id === pet.id && 'active')}
          onClick={() => setSelectedPet(pet)}
          title={pet.name}
        >
          <Avatar
            src={pet.avatar_url}
            alt={pet.name}
            size="sm"
            fallbackIcon={<Cat size={20} />}
            className="avatar"
          />
          <label>{pet.name}</label>
        </Button>
      ))}
    </ul>
  );
};

export default PetSelector;
