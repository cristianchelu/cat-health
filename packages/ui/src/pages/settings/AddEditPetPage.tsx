import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import PetForm from './components/PetForm';
import {
  usePet,
  useCreatePet,
  useUpdatePet,
  useDeletePet,
  useTogglePetPresence,
  useUploadPetAvatar,
} from '@/hooks/queries/petQueries';
import type { PostPetRequestDTO } from 'shared';
import './AddEditPetPage.css';

const AddEditPetPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const isEditing = Boolean(id);

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
    navigate('/settings');
  };

  const handleDelete = () => {
    if (!isEditing) return;
    deletePetMutation.mutate(undefined, {
      onSuccess: () => navigate('/settings'),
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
      <PetForm
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
