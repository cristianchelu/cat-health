import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { cn } from '@/lib/utils';
import { Cat, Plus } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';

import { usePetContext } from '@/hooks/context/usePetContext';
import { Button } from '../ui/Button';

import Avatar from '@/components/ui/Avatar';

import './PetSelector.css';

interface PetSelectorProps {
  variant?: 'desktop' | 'mobile';
}

const PetSelector: React.FC<PetSelectorProps> = ({ variant = 'desktop' }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pets, isLoading, error, selectedPet, setSelectedPet } =
    usePetContext();

  if (isLoading) {
    return (
      <div
        className={cn('pet-selector', variant)}
        role="status"
        aria-label={t('common.loading_pets')}
      >
        <div className="loading">
          <Spinner size={20} />
        </div>
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
      <ul className={cn('pet-selector', variant)}>
        <Button
          variant="ghost"
          className="item item--add"
          onClick={() => navigate('/settings/pets/new')}
          title={t('settings.add_pet')}
        >
          <div className="add-item-icon">
            <Plus size={20} />
          </div>
          <label>{t('settings.add_pet')}</label>
        </Button>
      </ul>
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
            className="pet-selector-avatar"
          />
          <label>{pet.name}</label>
        </Button>
      ))}
    </ul>
  );
};

export default PetSelector;
