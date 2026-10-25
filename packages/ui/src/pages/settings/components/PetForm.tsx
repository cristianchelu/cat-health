import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  PET_AVATAR_MAX_BYTES,
  PET_AVATAR_MIME_TYPES,
  type GetPetResponseDTO,
  type PetAlteredDTO,
  type PetSexDTO,
  type PostPetRequestDTO,
  type PutPetPresenceRequestDTO,
} from 'shared';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DiscardUnsavedDialog } from '@/components/ui/DiscardUnsavedDialog';
import {
  FormCard,
  FormCardBody,
  FormDatePicker,
  FormInput,
  FormSections,
  FormSelect,
  FormShell,
} from '@/components/ui/form';
import PetPhotoHeader from '@/components/pet/PetPhotoHeader';
import { useAppForm, useUnsavedBlocker } from '@/hooks/form';
import { useFormatters } from '@/hooks/context/useRegionalPreferences';
import { useIsPhone } from '@/hooks/useIsPhone';
import { isPetActive } from '@/lib/pets';
import PetLifecycleSection from './PetLifecycleSection';
import {
  ALTERED_CHOICES,
  MICROCHIP_PATTERN,
  PRESENCE_CHOICES,
  SEX_CHOICES,
  petAge,
  presenceChoiceOf,
  presenceForChoice,
  type PresenceChoice,
} from './petFormModel';
import './PetForm.css';

type PhotoDraft =
  | { kind: 'keep' }
  | { kind: 'replace'; file: File }
  | { kind: 'remove' };

interface PetFormValues {
  name: string;
  breed: string;
  birth_date: string | null;
  microchip: string;
  sex: PetSexDTO;
  altered: PetAlteredDTO;
  presence: PresenceChoice;
}

interface PetFormSubmit {
  pet: PostPetRequestDTO;
  photo: PhotoDraft;
  /** Null when presence did not change, or the form cannot set it. */
  presence: PutPetPresenceRequestDTO | null;
}

interface PetFormProps {
  /** The saved pet; absent when adding one. */
  pet?: GetPetResponseDTO;
  onSubmit: (values: PetFormSubmit) => Promise<boolean>;
  onCancel: () => void;
  onCloseProfile?: () => Promise<void>;
  onReopenProfile?: () => Promise<void>;
  onDelete?: () => void;
  isSubmitting?: boolean;
  isDeleting?: boolean;
  isChangingProfile?: boolean;
  error?: string | null;
}

function valuesOf(pet: GetPetResponseDTO | undefined): PetFormValues {
  return {
    name: pet?.name ?? '',
    breed: pet?.breed ?? '',
    birth_date: pet?.birth_date ?? null,
    microchip: pet?.microchip ?? '',
    sex: pet?.sex ?? 'unknown',
    altered: pet?.altered ?? 'unknown',
    presence: presenceChoiceOf(pet?.presence),
  };
}

const PetForm: React.FC<PetFormProps> = ({
  pet,
  onSubmit,
  onCancel,
  onCloseProfile,
  onReopenProfile,
  onDelete,
  isSubmitting = false,
  isDeleting = false,
  isChangingProfile = false,
  error,
}) => {
  const { t } = useTranslation();
  const { formatDate, formatNumber } = useFormatters();
  const isPhone = useIsPhone();
  const isEdit = pet != null;
  const isClosed = pet != null && !isPetActive(pet);
  // Name echoes read the saved record, never the draft.
  const savedName = pet?.name ?? '';

  const {
    control,
    handleSubmit,
    resetField,
    watch,
    formState: { isValid, isDirty },
  } = useAppForm<PetFormValues>({ defaultValues: valuesOf(pet) });

  // A close, a reopen or a save moves the server's presence; the field
  // follows it so the form never holds a presence the server has replaced.
  const serverPresence = presenceChoiceOf(pet?.presence);
  React.useEffect(() => {
    resetField('presence', { defaultValue: serverPresence });
  }, [resetField, serverPresence]);

  const [photo, setPhoto] = React.useState<PhotoDraft>({ kind: 'keep' });
  const [photoError, setPhotoError] = React.useState<string | null>(null);
  const [closeOpen, setCloseOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  // An object URL is a resource, so it is created and revoked by an effect
  // rather than in render.
  const [draftPhotoUrl, setDraftPhotoUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (photo.kind !== 'replace') {
      setDraftPhotoUrl(null);
      return;
    }
    const url = URL.createObjectURL(photo.file);
    setDraftPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const formDirty = isDirty || photo.kind !== 'keep';
  const { blockerOpen, onConfirmLeave, onCancelLeave, markSaved } =
    useUnsavedBlocker(formDirty);

  const takePhoto = (file: File) => {
    if (!PET_AVATAR_MIME_TYPES.includes(file.type)) {
      setPhotoError(t('common.unsupported_file_type'));
      return;
    }
    if (file.size > PET_AVATAR_MAX_BYTES) {
      setPhotoError(
        t('common.file_too_large', {
          size: formatNumber(PET_AVATAR_MAX_BYTES / 1_000_000),
        }),
      );
      return;
    }
    setPhotoError(null);
    setPhoto({ kind: 'replace', file });
  };

  const submit = async (values: PetFormValues) => {
    const presenceChanged = values.presence !== serverPresence;
    const saved = await onSubmit({
      pet: {
        name: values.name,
        breed: values.breed,
        birth_date: values.birth_date || null,
        microchip: values.microchip.trim() || null,
        sex: values.sex,
        altered: values.altered,
      },
      photo,
      presence:
        isEdit && !isClosed && presenceChanged
          ? presenceForChoice(values.presence)
          : null,
    });
    if (!saved) return;
    markSaved();
    onCancel();
  };

  const busy = isSubmitting || isDeleting || isChangingProfile;

  const sex = watch('sex');
  // The "altered" option reads Spayed or Neutered; with sex unknown it takes
  // the female word, as the field label already says "Spayed or neutered".
  const alteredWord = sex === 'male' ? 'male' : 'female';
  const age = petAge(watch('birth_date'), new Date());
  const describeAge = (): string | undefined => {
    if (!age) return undefined;
    const months = t('settings.pet_form.age_months', { count: age.months });
    if (age.years === 0) return t('settings.pet_form.age_old', { age: months });
    const years = t('settings.pet_form.age_years', { count: age.years });
    return t('settings.pet_form.age_old', {
      age: t('settings.pet_form.age_join', { years, months }),
    });
  };
  const ageText = describeAge();

  const idleSubmitLabel = isEdit
    ? t('settings.save_changes')
    : t('settings.add_pet_title');

  const hasPhoto =
    photo.kind === 'replace' ||
    (photo.kind === 'keep' && pet?.avatar_url != null);

  return (
    <>
      <FormSections className="pet-form">
        <PetPhotoHeader
          src={draftPhotoUrl ?? pet?.avatar_url}
          alt={savedName}
          hasPhoto={hasPhoto}
          accept={PET_AVATAR_MIME_TYPES.join(',')}
          canTakePhoto={isPhone}
          onFile={takePhoto}
          onRemove={() => {
            setPhotoError(null);
            setPhoto(
              pet?.avatar_url != null ? { kind: 'remove' } : { kind: 'keep' },
            );
          }}
          error={photoError ?? undefined}
          disabled={busy}
          labels={{
            addPhoto: t('settings.pet_form.add_photo'),
            changePhoto: t('settings.pet_form.change_photo'),
            drop: isEdit
              ? t('settings.pet_form.drop_photo', { name: savedName })
              : t('settings.pet_form.drop_photo_new'),
            sheetTitle: isEdit
              ? t('settings.pet_form.photo_sheet_title', { name: savedName })
              : t('settings.pet_form.photo_sheet_title_new'),
            takePhoto: t('settings.pet_form.take_photo'),
            choosePhoto: t('settings.pet_form.choose_photo'),
            removePhoto: t('settings.pet_form.remove_photo'),
          }}
        />

        <FormShell
          onSubmit={handleSubmit(submit)}
          error={error}
          actions={{
            onCancel,
            cancelLabel: t('settings.cancel'),
            submitLabel: isSubmitting ? t('settings.saving') : idleSubmitLabel,
            isSubmitting,
            submitDisabled: !isValid || busy || (isEdit && !formDirty),
            cancelDisabled: busy,
          }}
        >
          <FormCard>
            <FormCardBody>
              <div className="pet-form-fields">
                <FormInput
                  name="name"
                  control={control}
                  label={t('settings.pet_name')}
                  placeholder={t('settings.pet_name_placeholder')}
                  disabled={busy}
                  rules={{
                    required: t('settings.pet_name_required'),
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
                  placeholder={t('settings.breed_placeholder')}
                  disabled={busy}
                  rules={{
                    required: t('settings.breed_required'),
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
                  hint={ageText}
                  disabled={busy}
                />
                <FormInput
                  name="microchip"
                  control={control}
                  label={t('settings.pet_form.microchip')}
                  placeholder={t('settings.pet_form.microchip_placeholder')}
                  inputMode="numeric"
                  disabled={busy}
                  rules={{
                    validate: (value) =>
                      !value?.trim() ||
                      MICROCHIP_PATTERN.test(value) ||
                      t('settings.pet_form.microchip_invalid'),
                  }}
                />
                <FormSelect
                  name="sex"
                  control={control}
                  label={t('settings.pet_form.sex')}
                  disabled={busy}
                  options={SEX_CHOICES.map((value) => ({
                    value,
                    label: t(`settings.pet_form.sex_${value}`),
                  }))}
                />
                <FormSelect
                  name="altered"
                  control={control}
                  label={t(`settings.pet_form.altered_label_${sex}`)}
                  disabled={busy}
                  options={ALTERED_CHOICES.map((value) => ({
                    value,
                    label:
                      value === 'altered'
                        ? t(`settings.pet_form.altered_label_${alteredWord}`)
                        : t(`settings.pet_form.altered_option_${value}`),
                  }))}
                />
                {isEdit && !isClosed && (
                  <FormSelect
                    name="presence"
                    control={control}
                    label={t('settings.pet_form.presence_label')}
                    hint={t('settings.pet_form.presence_hint', {
                      name: savedName,
                    })}
                    disabled={busy}
                    options={PRESENCE_CHOICES.map((value) => ({
                      value,
                      label: t(`settings.pet_form.presence_${value}`),
                    }))}
                  />
                )}
              </div>
            </FormCardBody>
          </FormCard>
        </FormShell>

        {pet && onDelete && onCloseProfile && onReopenProfile && (
          <PetLifecycleSection
            disabled={busy}
            closeRow={{
              closed: isClosed,
              title: isClosed
                ? t('settings.profile_closed')
                : t('settings.pet_form.close_title', { name: savedName }),
              description:
                isClosed && pet.closed_at
                  ? t('settings.pet_form.closed_desc', {
                      date: formatDate(new Date(pet.closed_at)),
                    })
                  : t('settings.pet_form.close_desc', { name: savedName }),
              actionLabel: isClosed
                ? t('settings.pet_form.reopen_button')
                : t('settings.pet_form.close_button'),
              onAction: isClosed
                ? () => void onReopenProfile()
                : () => setCloseOpen(true),
            }}
            deleteRow={{
              title: t('settings.pet_form.delete_title'),
              description: t('settings.pet_form.delete_desc', {
                name: savedName,
              }),
              actionLabel: t('settings.pet_form.delete_button'),
              onAction: () => setDeleteOpen(true),
            }}
          />
        )}
      </FormSections>

      <DiscardUnsavedDialog
        open={blockerOpen}
        onConfirm={onConfirmLeave}
        onCancel={onCancelLeave}
      />
      {pet && onCloseProfile && (
        <ConfirmDialog
          open={closeOpen}
          title={t('settings.pet_form.close_confirm_title', {
            name: savedName,
          })}
          description={t('settings.pet_form.close_confirm_desc', {
            name: savedName,
          })}
          confirmLabel={t('settings.pet_form.close_confirm')}
          isConfirming={isChangingProfile}
          onConfirm={() => {
            setCloseOpen(false);
            void onCloseProfile();
          }}
          onCancel={() => setCloseOpen(false)}
        />
      )}
      {pet && onDelete && (
        <ConfirmDialog
          open={deleteOpen}
          title={t('settings.pet_form.delete_confirm_title', {
            name: savedName,
          })}
          description={t('settings.pet_form.delete_confirm_desc', {
            name: savedName,
          })}
          confirmLabel={
            isDeleting
              ? t('settings.deleting')
              : t('settings.pet_form.delete_confirm')
          }
          variant="danger"
          isConfirming={isDeleting}
          onConfirm={() => {
            setDeleteOpen(false);
            // The pet is going away, so pending edits to it are moot.
            markSaved();
            onDelete();
          }}
          onCancel={() => setDeleteOpen(false)}
        />
      )}
    </>
  );
};

export { type PetFormSubmit, type PhotoDraft };
export default PetForm;
