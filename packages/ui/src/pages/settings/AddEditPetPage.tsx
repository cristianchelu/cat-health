import React from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import PetForm, {
  type PetFormSubmit,
  type PhotoDraft,
} from './components/PetForm';
import {
  usePet,
  useCreatePet,
  useUpdatePet,
  useDeletePet,
  useSetPetPresence,
  useCloseProfile,
  useReopenProfile,
  useUploadPetAvatar,
  useDeletePetAvatar,
} from '@/hooks/queries/petQueries';
import { SettingsFormPage } from '@/components/ui/SettingsFormPage';
import { useBackNavigation } from '@/hooks/useBackNavigation';
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
  const setPresenceMutation = useSetPetPresence(petId);
  const closeProfileMutation = useCloseProfile(petId);
  const reopenProfileMutation = useReopenProfile(petId);
  const uploadAvatarMutation = useUploadPetAvatar();
  const deleteAvatarMutation = useDeletePetAvatar(petId);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  /** The draft photo's write, if it has one. Removal only exists when editing. */
  const savePhoto = (targetPetId: number, photo: PhotoDraft) => {
    if (photo.kind === 'replace') {
      return uploadAvatarMutation.mutateAsync({
        petId: targetPetId,
        file: photo.file,
      });
    }
    if (photo.kind === 'remove') return deleteAvatarMutation.mutateAsync();
    return undefined;
  };

  const handleSubmit = async ({
    pet: values,
    photo,
    presence,
  }: PetFormSubmit): Promise<boolean> => {
    setSubmitError(null);
    try {
      if (isEditing) {
        const savingPet = updatePetMutation.mutateAsync(values);
        const savingPhoto = savePhoto(petId, photo);
        const savingPresence = presence
          ? setPresenceMutation.mutateAsync(presence)
          : undefined;
        await Promise.all([savingPet, savingPhoto, savingPresence]);
      } else {
        // The photo needs the new pet's id, so it waits for the create.
        const created = await createPetMutation.mutateAsync(values);
        await savePhoto(created.id, photo);
      }
      return true;
    } catch {
      setSubmitError(t('settings.pet_save_error'));
      return false;
    }
  };

  const changeProfile = async (action: () => Promise<unknown>) => {
    setSubmitError(null);
    try {
      await action();
    } catch {
      setSubmitError(t('settings.pet_form.lifecycle_error'));
    }
  };

  const handleDelete = () => {
    if (!isEditing) return;
    deletePetMutation.mutate(undefined, {
      onSuccess: () => back.go(),
    });
  };

  return (
    <SettingsFormPage
      className="page-add-edit-pet"
      title={isEditing ? t('settings.edit_pet') : t('settings.add_pet_title')}
      back={{ to: back.to, label: back.label, onNavigate: back.go }}
      isLoading={isEditing && isLoading}
      loadingMessage={t('settings.loading_pet_data')}
    >
      {/* Keyed per pet: the form seeds its fields once per mount, so moving
          between two pets on this route must remount it. */}
      <PetForm
        key={isEditing ? petId : 'new'}
        pet={pet}
        onSubmit={handleSubmit}
        onCancel={back.go}
        onCloseProfile={
          isEditing
            ? () => changeProfile(() => closeProfileMutation.mutateAsync())
            : undefined
        }
        onReopenProfile={
          isEditing
            ? () => changeProfile(() => reopenProfileMutation.mutateAsync())
            : undefined
        }
        onDelete={isEditing ? handleDelete : undefined}
        error={submitError}
        isSubmitting={
          createPetMutation.isPending ||
          updatePetMutation.isPending ||
          uploadAvatarMutation.isPending ||
          deleteAvatarMutation.isPending ||
          setPresenceMutation.isPending
        }
        isDeleting={deletePetMutation.isPending}
        isChangingProfile={
          closeProfileMutation.isPending || reopenProfileMutation.isPending
        }
      />
    </SettingsFormPage>
  );
};

export default AddEditPetPage;
