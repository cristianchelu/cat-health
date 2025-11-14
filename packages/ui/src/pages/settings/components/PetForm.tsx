import React from 'react';
import { useForm } from 'react-hook-form';
import { FormField, Input, DatePicker } from '@/components/ui/form';
import { Button } from '@/components/ui/Button';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Cat } from 'lucide-react';
import type { PostPetRequestDTO } from 'shared';
import AvatarUpload from '@/components/pet/AvatarUpload';

import './PetForm.css';

interface PetFormProps {
  initialData?: Partial<PostPetRequestDTO>;
  existingAvatarUrl?: string | null;
  onSubmit: (data: PostPetRequestDTO, avatarFile: File | null) => void;
  onCancel: () => void;
  onDelete?: () => void; // optional delete handler when editing
  isSubmitting?: boolean;
  isDeleting?: boolean;
  title?: string;
}

const PetForm: React.FC<PetFormProps> = ({
  initialData,
  existingAvatarUrl,
  onSubmit,
  onCancel,
  onDelete,
  isSubmitting = false,
  isDeleting = false,
  title = 'Add Pet',
}) => {
  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    setValue,
    watch,
  } = useForm<PostPetRequestDTO>({
    defaultValues: {
      name: initialData?.name || '',
      breed: initialData?.breed || '',
      birth_date: initialData?.birth_date || '',
    },
    mode: 'onChange',
  });

  const watchedBirthDate = watch('birth_date');

  const [avatarFile, setAvatarFile] = React.useState<File | null>(null);

  const handleFormSubmit = (data: PostPetRequestDTO) => {
    onSubmit(data, avatarFile);
  };

  return (
    <div className="pet-form">
      <SectionHeader icon={<Cat size={20} />}>{title}</SectionHeader>

      <form onSubmit={handleSubmit(handleFormSubmit)}>
        <AvatarUpload
          value={avatarFile}
          existingUrl={existingAvatarUrl || null}
          onChange={setAvatarFile}
          disabled={isSubmitting || isDeleting}
          className="avatar-section"
        />
        <FormField
          label="Pet Name"
          error={errors.name?.message as string}
          required
        >
          <Input
            {...register('name', {
              required: 'Pet name is required',
              minLength: {
                value: 1,
                message: 'Pet name must be at least 1 character',
              },
              maxLength: {
                value: 50,
                message: 'Pet name must be less than 50 characters',
              },
            })}
            variant={errors.name ? 'error' : 'default'}
            placeholder="Enter your pet's name"
            disabled={isSubmitting}
          />
        </FormField>

        <FormField
          label="Breed"
          error={errors.breed?.message as string}
          required
        >
          <Input
            {...register('breed', {
              required: 'Breed is required',
              minLength: {
                value: 1,
                message: 'Breed must be at least 1 character',
              },
              maxLength: {
                value: 50,
                message: 'Breed must be less than 50 characters',
              },
            })}
            variant={errors.breed ? 'error' : 'default'}
            placeholder="Enter your pet's breed"
            disabled={isSubmitting}
          />
        </FormField>

        <FormField
          label="Birth Date"
          error={errors.birth_date?.message as string}
          description="Optional: Enter your pet's birth date for age tracking"
        >
          <DatePicker
            {...register('birth_date')}
            variant={errors.birth_date ? 'error' : 'default'}
            value={watchedBirthDate}
            onChange={(e) => setValue('birth_date', e.target.value)}
            disabled={isSubmitting}
          />
        </FormField>

        <div className="actions">
          {onDelete && (
            <Button
              type="button"
              variant="danger"
              onClick={onDelete}
              disabled={isDeleting || isSubmitting}
            >
              {isDeleting ? 'Deleting…' : 'Delete'}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting || isDeleting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={!isValid || isSubmitting || isDeleting}
          >
            {isSubmitting
              ? 'Saving...'
              : title === 'Add Pet'
                ? 'Add Pet'
                : 'Save Changes'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default PetForm;
