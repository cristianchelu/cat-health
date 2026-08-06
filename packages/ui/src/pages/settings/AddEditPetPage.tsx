import React from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import PetForm from './components/PetForm';
import {
  usePet,
  useCreatePet,
  useUpdatePet,
  useDeletePet,
  useTogglePetPresence,
  useUploadPetAvatar,
} from '@/hooks/queries/petQueries';
import { useBackNavigation } from '@/hooks/useBackNavigation';
import type { PostPetRequestDTO } from 'shared';
import './AddEditPetPage.css';

const AddEditPetPage: React.FC = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id?: string }>();
  const isEditing = Boolean(id);
  const back = useBackNavigation({
    to: '/settings',
    label: t('navigation.settings'),
  });

  const petId = parseInt(id || '0');
  const { data: pet, isLoading } = usePet(petId, isEditing);

  const createPetMutation = useCreatePet();
  const updatePetMutation = useUpdatePet(petId);
  const deletePetMutation = useDeletePet(petId);
  const togglePresenceMutation = useTogglePetPresence(petId);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const uploadAvatarMutation = useUploadPetAvatar(petId);

  const handleSubmit = async (
    data: PostPetRequestDTO,
    avatarFile: File | null,
    awayFromHome: boolean,
  ): Promise<boolean> => {
    setSubmitError(null);
    try {
      if (isEditing) {
        await updatePetMutation.mutateAsync(data);
        if (avatarFile) {
          await uploadAvatarMutation.mutateAsync(avatarFile);
        }
        if (pet && awayFromHome !== pet.is_away) {
          await togglePresenceMutation.mutateAsync();
        }
      } else {
        const newPet = await createPetMutation.mutateAsync(data);
        if (avatarFile) {
          const form = new FormData();
          form.append('avatar', avatarFile);
          const response = await fetch(`api/pets/${newPet.id}/avatar`, {
            method: 'POST',
            body: form,
          });
          if (!response.ok) throw new Error('Failed to upload avatar');
        }
      }
      return true;
    } catch {
      setSubmitError(t('settings.pet_save_error'));
      return false;
    }
  };

  const handleCancel = () => {
    back.go();
  };

  const handleDelete = () => {
    if (!isEditing) return;
    deletePetMutation.mutate(undefined, {
      onSuccess: () => back.go(),
    });
  };

  if (isEditing && isLoading) {
    return (
      <div className="page-loading">
        <div>{t('settings.loading_pet_data')}</div>
      </div>
    );
  }

  return (
    <div className="page-add-edit-pet">
      {/*
        Keyed per pet: PetForm seeds react-hook-form from `defaultValues`, which
        RHF reads once per mount, and holds the avatar/away-from-home state in
        its own `useState`. A param-only route change (/settings/pets/1 →
        /settings/pets/2) reuses this component, so without the key the form
        would keep the previous pet's values while the page reads as the new
        one — and `isDirty` would be false, so the unsaved-changes guard would
        not catch it either.
      */}
      <PetForm
        key={isEditing ? petId : 'new'}
        title={isEditing ? t('settings.edit_pet') : t('settings.add_pet_title')}
        petId={isEditing ? petId : undefined}
        isAway={pet?.is_away ?? false}
        initialData={pet || undefined}
        existingAvatarUrl={pet?.avatar_url ?? null}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        onDelete={isEditing ? handleDelete : undefined}
        error={submitError}
        isSubmitting={
          createPetMutation.isPending ||
          updatePetMutation.isPending ||
          uploadAvatarMutation.isPending ||
          togglePresenceMutation.isPending
        }
        isDeleting={deletePetMutation.isPending}
      />
    </div>
  );
};

export default AddEditPetPage;
