import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Cat } from 'lucide-react';

import { usePetContext } from '@/hooks/context/usePetContext';
import { Button } from '../ui/Button';

import Avatar from '@/components/ui/Avatar';

import './PetSelector.css';

interface PetSelectorProps {
  variant?: 'desktop' | 'mobile';
}

const PetSelector: React.FC<PetSelectorProps> = ({ variant = 'desktop' }) => {
  const { t } = useTranslation();
  const { pets, isLoading, error, selectedPet, setSelectedPet } =
    usePetContext();

  if (isLoading) {
    return (
      <div className={cn('pet-selector', variant)}>
        <div className="loading">{t('common.loading_pets')}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('pet-selector', variant)}>
        <div className="error">{t('common.error_loading_pets')}</div>
      </div>
    );
  }

  if (pets.length === 0) {
    return (
      <div className={cn('pet-selector', variant)}>
        <div className="empty">{t('common.no_pets_found')}</div>
      </div>
    );
  }

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
