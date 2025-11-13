import React from 'react';
import { useNavigate, useParams } from 'react-router';
import PetForm from './components/PetForm';
import type { PostPetRequestDTO } from 'shared';
import './AddEditPetPage.css';
import {
  usePet,
  useCreatePet,
  useUpdatePet,
  useDeletePet,
} from '@/hooks/queries/petQueries';

const AddEditPetPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const isEditing = Boolean(id);

  const petId = parseInt(id || '0');
  const { data: pet, isLoading } = usePet(petId, isEditing);

  const createPetMutation = useCreatePet();
  const updatePetMutation = useUpdatePet(petId);
  const deletePetMutation = useDeletePet(petId);

  const handleSubmit = (data: PostPetRequestDTO) => {
    if (isEditing) {
      updatePetMutation.mutate(data, {
        onSuccess: () => navigate('/settings'),
      });
    } else {
      createPetMutation.mutate(data, {
        onSuccess: () => navigate('/settings'),
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
        <div>Loading pet data...</div>
      </div>
    );
  }

  return (
    <div className="page-add-edit-pet">
      <PetForm
        title={isEditing ? 'Edit Pet' : 'Add Pet'}
        initialData={pet || undefined}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        onDelete={isEditing ? handleDelete : undefined}
        isSubmitting={
          createPetMutation.isPending || updatePetMutation.isPending
        }
        isDeleting={deletePetMutation.isPending}
      />
    </div>
  );
};

export default AddEditPetPage;
