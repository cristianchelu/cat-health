import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import PetForm from './components/PetForm';
import {
  usePet,
  useCreatePet,
  useUpdatePet,
  useDeletePet,
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

  const uploadAvatarMutation = useUploadPetAvatar(petId);

  const handleSubmit = (data: PostPetRequestDTO, avatarFile: File | null) => {
    if (isEditing) {
      updatePetMutation.mutate(data, {
        onSuccess: async () => {
          if (avatarFile) {
            await uploadAvatarMutation.mutateAsync(avatarFile);
          }
          navigate('/settings');
        },
      });
    } else {
      createPetMutation.mutate(data, {
        onSuccess: async (newPet) => {
          if (avatarFile) {
            // Use a one-off upload for the new pet id without invoking a hook inside callback
            const form = new FormData();
            form.append('avatar', avatarFile);
            await fetch(`api/pets/${newPet.id}/avatar`, {
              method: 'POST',
              body: form,
            });
          }
          navigate('/settings');
        },
      });
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
        isSubmitting={
          createPetMutation.isPending ||
          updatePetMutation.isPending ||
          uploadAvatarMutation.isPending
        }
        isDeleting={deletePetMutation.isPending}
      />
    </div>
  );
};

export default AddEditPetPage;
