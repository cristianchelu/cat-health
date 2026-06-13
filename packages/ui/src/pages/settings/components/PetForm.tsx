import React from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { FormField, Input, DatePicker } from '@/components/ui/form';
import { Button } from '@/components/ui/Button';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Switch } from '@/components/ui/Switch';
import { Cat } from 'lucide-react';
import type { PostPetRequestDTO } from 'shared';
import { useTogglePetPresence } from '@/hooks/queries/petQueries';
import AvatarUpload from '@/components/pet/AvatarUpload';

import './PetForm.css';

interface PetFormProps {
  initialData?: Partial<PostPetRequestDTO>;
  existingAvatarUrl?: string | null;
  petId?: number;
  isAway?: boolean;
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
  petId,
  isAway = false,
  onSubmit,
  onCancel,
  onDelete,
  isSubmitting = false,
  isDeleting = false,
  title,
}) => {
  const { t } = useTranslation();
  const togglePresenceMutation = useTogglePetPresence(petId ?? 0);
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

  // eslint-disable-next-line react-hooks/incompatible-library -- RHF watch() is safe here for derived UI
  const watchedBirthDate = watch('birth_date');

  const [avatarFile, setAvatarFile] = React.useState<File | null>(null);

  const handleFormSubmit = (data: PostPetRequestDTO) => {
    onSubmit(data, avatarFile);
  };

  return (
    <div className="pet-form">
      <SectionHeader icon={<Cat size={20} />}>
        {title || t('settings.add_pet_title')}
      </SectionHeader>

      <form onSubmit={handleSubmit(handleFormSubmit)}>
        <AvatarUpload
          value={avatarFile}
          existingUrl={existingAvatarUrl || null}
          onChange={setAvatarFile}
          disabled={isSubmitting || isDeleting}
          className="avatar-section"
        />
        <FormField
          label={t('settings.pet_name')}
          error={errors.name?.message as string}
          required
        >
          <Input
            {...register('name', {
              required: t('settings.pet_name_required'),
              minLength: {
                value: 1,
                message: t('settings.pet_name_min'),
              },
              maxLength: {
                value: 50,
                message: t('settings.pet_name_max'),
              },
            })}
            variant={errors.name ? 'error' : 'default'}
            placeholder={t('settings.pet_name_placeholder')}
            disabled={isSubmitting}
          />
        </FormField>

        <FormField
          label={t('settings.breed')}
          error={errors.breed?.message as string}
          required
        >
          <Input
            {...register('breed', {
              required: t('settings.breed_required'),
              minLength: {
                value: 1,
                message: t('settings.breed_min'),
              },
              maxLength: {
                value: 50,
                message: t('settings.breed_max'),
              },
            })}
            variant={errors.breed ? 'error' : 'default'}
            placeholder={t('settings.breed_placeholder')}
            disabled={isSubmitting}
          />
        </FormField>

        <FormField
          label={t('settings.birth_date')}
          error={errors.birth_date?.message as string}
          description={t('settings.birth_date_desc')}
        >
          <DatePicker
            {...register('birth_date')}
            variant={errors.birth_date ? 'error' : 'default'}
            value={watchedBirthDate}
            onChange={(e) => setValue('birth_date', e.target.value)}
            disabled={isSubmitting}
          />
        </FormField>

        {petId != null && (
          <FormField label={t('settings.exclude_from_analytics')}>
            <Switch
              checked={isAway}
              onCheckedChange={() => togglePresenceMutation.mutate()}
              disabled={
                isSubmitting ||
                isDeleting ||
                togglePresenceMutation.isPending
              }
            />
          </FormField>
        )}

        <div className="actions">
          {onDelete && (
            <Button
              type="button"
              variant="danger"
              onClick={onDelete}
              disabled={isDeleting || isSubmitting}
            >
              {isDeleting ? t('settings.deleting') : t('settings.delete')}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting || isDeleting}
          >
            {t('settings.cancel')}
          </Button>
          <Button
            type="submit"
            disabled={!isValid || isSubmitting || isDeleting}
          >
            {isSubmitting
              ? t('settings.saving')
              : title === t('settings.add_pet_title')
                ? t('settings.add_pet_title')
                : t('settings.save_changes')}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default PetForm;
