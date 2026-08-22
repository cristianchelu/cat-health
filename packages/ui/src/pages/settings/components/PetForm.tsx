import React from 'react';
import { useTranslation } from 'react-i18next';
import type { PostPetRequestDTO } from 'shared';
import { Button } from '@/components/ui/Button';
import { SettingsFormPage } from '@/components/ui/SettingsFormPage';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DiscardUnsavedDialog } from '@/components/ui/DiscardUnsavedDialog';
import {
  FormDatePicker,
  FormField,
  FormInput,
  FormShell,
  LabeledSwitchField,
} from '@/components/ui/form';
import { useAppForm, useUnsavedBlocker } from '@/hooks/form';
import { useBackNavigation } from '@/hooks/useBackNavigation';
import AvatarUpload from '@/components/pet/AvatarUpload';

interface PetFormProps {
  initialData?: Partial<PostPetRequestDTO>;
  existingAvatarUrl?: string | null;
  petId?: number;
  isAway?: boolean;
  onSubmit: (
    data: PostPetRequestDTO,
    avatarFile: File | null,
    awayFromHome: boolean,
  ) => Promise<boolean>;
  onCancel: () => void;
  onDelete?: () => void;
  isSubmitting?: boolean;
  isDeleting?: boolean;
  error?: string | null;
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
  error,
  title,
}) => {
  const { t } = useTranslation();
  const back = useBackNavigation({
    to: '/settings',
    label: t('navigation.settings'),
  });
  const {
    control,
    handleSubmit,
    formState: { isValid, isDirty },
  } = useAppForm<PostPetRequestDTO>({
    defaultValues: {
      name: initialData?.name || '',
      breed: initialData?.breed || '',
      birth_date: initialData?.birth_date ?? null,
    },
  });

  const [avatarFile, setAvatarFile] = React.useState<File | null>(null);
  const [awayFromHome, setAwayFromHome] = React.useState(isAway);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  const avatarDirty = avatarFile != null;
  const awayDirty = petId != null && awayFromHome !== isAway;
  const formDirty = isDirty || avatarDirty || awayDirty;

  const { blockerOpen, onConfirmLeave, onCancelLeave, markSaved } =
    useUnsavedBlocker(formDirty);

  React.useEffect(() => {
    setAwayFromHome(isAway);
  }, [petId, isAway]);

  const handleFormSubmit = async (data: PostPetRequestDTO) => {
    const saved = await onSubmit(data, avatarFile, awayFromHome);
    if (!saved) return;
    markSaved();
    onCancel();
  };

  const busy = isSubmitting || isDeleting;

  const isAdd = petId == null;

  return (
    <SettingsFormPage
      title={title || t('settings.add_pet_title')}
      back={{ to: back.to, label: back.label, onNavigate: onCancel }}
    >
      <FormShell
        onSubmit={handleSubmit(handleFormSubmit)}
        error={error}
        actions={{
          onCancel,
          cancelLabel: t('settings.cancel'),
          submitLabel: busy
            ? t('settings.saving')
            : isAdd
              ? t('settings.add_pet_title')
              : t('settings.save_changes'),
          isSubmitting: busy,
          submitDisabled: !isValid || busy,
          cancelDisabled: busy,
          leading: onDelete ? (
            <Button
              type="button"
              variant="danger"
              onClick={() => setDeleteOpen(true)}
              disabled={busy}
            >
              {isDeleting ? t('settings.deleting') : t('settings.delete')}
            </Button>
          ) : undefined,
        }}
      >
        <AvatarUpload
          value={avatarFile}
          existingUrl={existingAvatarUrl || null}
          onChange={setAvatarFile}
          disabled={busy}
          className="avatar-section"
        />
        <FormInput
          name="name"
          control={control}
          label={t('settings.pet_name')}
          required
          placeholder={t('settings.pet_name_placeholder')}
          disabled={isSubmitting}
          rules={{
            required: t('settings.pet_name_required'),
            minLength: {
              value: 1,
              message: t('settings.pet_name_min'),
            },
            maxLength: {
              value: 50,
              message: t('settings.pet_name_max'),
            },
          }}
        />
        <FormInput
          name="breed"
          control={control}
          label={t('settings.breed')}
          required
          placeholder={t('settings.breed_placeholder')}
          disabled={isSubmitting}
          rules={{
            required: t('settings.breed_required'),
            minLength: {
              value: 1,
              message: t('settings.breed_min'),
            },
            maxLength: {
              value: 50,
              message: t('settings.breed_max'),
            },
          }}
        />
        <FormDatePicker
          name="birth_date"
          control={control}
          label={t('settings.birth_date')}
          description={t('settings.birth_date_desc')}
          disabled={isSubmitting}
        />
        {petId != null && (
          <FormField
            label={t('settings.away_from_home')}
            htmlFor="pet-away-from-home"
          >
            <LabeledSwitchField
              id="pet-away-from-home"
              checked={awayFromHome}
              onCheckedChange={setAwayFromHome}
              disabled={busy}
            />
          </FormField>
        )}
      </FormShell>

      <DiscardUnsavedDialog
        open={blockerOpen}
        onConfirm={onConfirmLeave}
        onCancel={onCancelLeave}
      />
      {onDelete ? (
        <ConfirmDialog
          open={deleteOpen}
          title={t('settings.delete')}
          description={t('settings.confirm_delete_pet')}
          confirmLabel={
            isDeleting ? t('settings.deleting') : t('settings.delete')
          }
          variant="danger"
          isConfirming={isDeleting}
          onConfirm={() => {
            setDeleteOpen(false);
            // The pet is going away, so pending edits to it are moot — don't
            // ask the user to confirm discarding them on the way out.
            markSaved();
            onDelete();
          }}
          onCancel={() => setDeleteOpen(false)}
        />
      ) : null}
    </SettingsFormPage>
  );
};

export default PetForm;
