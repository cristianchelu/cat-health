import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { DEFAULT_RECOGNIZER_MODEL, type GetDeviceResponseDTO } from 'shared';
import {
  addDraftReferenceImages,
  draftFromRecognitionLink,
  isPetWatched,
  listRecognitionAccounts,
  recognitionConfigEqual,
  removeDraftReferenceImage,
  resolveRecognitionGate,
  resolveRecognitionSaveAction,
  setPetWatched,
} from '@/lib/recognitionConfig';
import { useDraftForm } from '@/hooks/form';
import { usePetContext } from '@/hooks/context/usePetContext';
import {
  getProviderBrand,
  providerBrandLabel,
} from '@/pages/settings/provider-wizard/flows/providerBrandRegistry.ts';
import {
  useLinkDeviceRecognition,
  useProviderAccounts,
  useProviders,
  useUnlinkDeviceRecognition,
  useUpdateDeviceRecognitionConfig,
} from '@/hooks/queries/deviceQueries';
import {
  RecognitionTabView,
  type RecognitionAccountOption,
  type RecognitionTabViewProps,
  type TrainedPetRow,
} from '@/components/devices/recognition';

const ADD_PROVIDER_ROUTE = '/settings/providers/new';

interface RecognitionTabProps {
  device: GetDeviceResponseDTO;
  onDirtyChange?: (dirty: boolean) => void;
  onGoToCamera: () => void;
}

/**
 * Wires the Recognition tab: which account pays for the call, the scene config
 * drafted against it, and reference-image edits. Everything it edits belongs to
 * *this* device — the tab no longer reaches into a second device's config the
 * way the recognizer-device model forced it to. RecognitionTabView stays
 * presentational.
 */
const RecognitionTab: React.FC<RecognitionTabProps> = ({
  device,
  onDirtyChange,
  onGoToCamera,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pets } = usePetContext();
  const { data: accounts } = useProviderAccounts();
  const { data: providers } = useProviders();

  const linkMutation = useLinkDeviceRecognition(device.id);
  const unlinkMutation = useUnlinkDeviceRecognition(device.id);
  const updateConfigMutation = useUpdateDeviceRecognitionConfig(device.id);

  /*
   * Offerable accounts, plus the linked one even when it has been switched
   * off — the same rule `listCameraCandidates` applies, so a stale link stays
   * visible and unlinkable rather than vanishing behind an empty picker.
   */
  const linkedAccountId = device.recognition?.account_id;
  const availableAccounts = React.useMemo(() => {
    const offerable = listRecognitionAccounts(accounts ?? [], providers ?? []);
    if (linkedAccountId == null) return offerable;
    if (offerable.some((account) => account.id === linkedAccountId)) {
      return offerable;
    }
    const linked = (accounts ?? []).find(
      (account) => account.id === linkedAccountId,
    );
    return linked ? [...offerable, linked] : offerable;
  }, [accounts, providers, linkedAccountId]);

  const hasCameraLink = device.camera_link != null;
  const gate = resolveRecognitionGate({
    hasCameraLink,
    accountCount: availableAccounts.length,
  });

  const baselineKey = JSON.stringify(device.recognition ?? null);
  const baseline = React.useMemo(
    () => draftFromRecognitionLink(device.recognition),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- baselineKey drives sync
    [baselineKey],
  );

  const {
    draft,
    setDraft,
    patchDraft,
    isDirty,
    commit,
    requestReset,
    discardConfirm,
  } = useDraftForm(baseline, {
    baselineKey,
    isEqual: recognitionConfigEqual,
  });

  React.useEffect(() => {
    onDirtyChange?.(isDirty);
    return () => onDirtyChange?.(false);
  }, [isDirty, onDirtyChange]);

  const handleToggleWatched = (petId: number, watched: boolean) => {
    setDraft((current) => ({
      ...current,
      ignoredPets: setPetWatched(current.ignoredPets, petId, watched),
    }));
  };

  const handleConfirmAddImages = (petId: number, mediaIds: number[]) => {
    setDraft((current) => addDraftReferenceImages(current, petId, mediaIds));
  };

  const handleRemoveImage = (petId: number, mediaId: number) => {
    setDraft((current) => removeDraftReferenceImage(current, petId, mediaId));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const action = resolveRecognitionSaveAction(baseline, draft);
    if (action.type === 'none') return;

    if (action.type === 'unlink') {
      unlinkMutation.mutate(undefined, { onSuccess: () => commit() });
      return;
    }

    if (action.type === 'link') {
      linkMutation.mutate(
        { account_id: action.accountId, config: action.config },
        { onSuccess: () => commit() },
      );
      return;
    }

    updateConfigMutation.mutate(
      { config: action.config },
      { onSuccess: () => commit() },
    );
  };

  const accountOptions: RecognitionAccountOption[] = availableAccounts.map(
    (account) => ({
      id: account.id,
      name: account.name,
      description: providerBrandLabel(getProviderBrand(account.provider), t),
    }),
  );

  const selectedAccountName = availableAccounts.find(
    (account) => account.id === draft.accountId,
  )?.name;

  const petRows: TrainedPetRow[] = pets.map((pet) => {
    const petKey = String(pet.id);
    const watched = isPetWatched(draft.ignoredPets, pet.id);
    const referenceIds = draft.referenceImages[petKey] ?? [];
    const media = device.reference_media?.[petKey] ?? [];
    const mediaById = new Map(media.map((item) => [item.id, item]));
    const thumbs = referenceIds
      .map((id) => mediaById.get(id))
      .filter(
        (item): item is { id: number; file_path: string } => item !== undefined,
      )
      .map((item) => ({
        id: item.id,
        url: `api/media/${item.file_path}`,
        alt: t('pet_recognizer.reference_for_alt', { name: pet.name }),
      }));

    return {
      id: pet.id,
      name: pet.name,
      avatarUrl: pet.avatar_url,
      isWatched: watched,
      watchAriaLabel: t('pet_recognizer.watch_pet_label', { name: pet.name }),
      statusLabel: watched
        ? t('pet_recognizer.reference_images_count', { count: thumbs.length })
        : t('pet_recognizer.pet_not_watched'),
      thumbs,
      referenceImageIds: referenceIds,
      expandLabel: t('pet_recognizer.expand_pet_row', { name: pet.name }),
      addImagesLabel: t('pet_recognizer.add_from_events'),
      removeImageLabel: t('pet_recognizer.remove_image'),
    };
  });

  const isSaving =
    linkMutation.isPending ||
    unlinkMutation.isPending ||
    updateConfigMutation.isPending;
  const saveFailed =
    linkMutation.isError ||
    unlinkMutation.isError ||
    updateConfigMutation.isError;

  const viewProps: RecognitionTabViewProps = {
    copy: {
      lockedTitle: t('recognition.locked_title'),
      lockedCta: t('recognition.locked_cta'),
      providerHint: t('recognition.provider_hint'),
      providerCta: t('recognition.provider_cta'),
      noAccountTitle: t('recognition.no_account_title'),
      noAccountCta: t('recognition.no_account_cta'),
      autoIdentifyLabel: t('recognition.auto_identify_label'),
      autoIdentifyHint: t('recognition.auto_identify_hint'),
      accountTitle: t('recognition.account_title'),
      accountSubtitle: t('recognition.account_subtitle'),
      accountNoneSelected: t('recognition.account_none_selected'),
      accountChangeLabel: t('camera_link.change_source'),
      accountPickerTitle: t('recognition.account_picker_title'),
      accountPickerEmpty: t('recognition.account_picker_empty'),
      accountNoneLabel: t('camera_link.none_source'),
      modelLabel: t('recognition.model_label'),
      modelPlaceholder: t('recognition.model_placeholder', {
        model: DEFAULT_RECOGNIZER_MODEL,
      }),
      /* The default is *named* here, not in the placeholder: the field above
         taught "placeholder = what an empty field means", and the scene
         textarea below shows an example — naming the default in prose keeps
         both placeholders reading as examples. */
      modelHint: t('recognition.model_hint', {
        model: DEFAULT_RECOGNIZER_MODEL,
      }),
      promptLabel: t('recognition.prompt_label'),
      promptHint: t('recognition.prompt_hint'),
      promptPlaceholder: t('recognition.prompt_placeholder'),
      trainedPetsTitle: t('recognition.trained_pets_title'),
      trainedPetsSubtitle: t('recognition.trained_pets_subtitle'),
      trainedPetsEmpty: t('recognition.trained_pets_empty'),
      testRecognitionLabel: t('pet_recognizer.test_recognition'),
      cancelLabel: t('common.cancel'),
      saveLabel: t('common.save'),
      saveError: t('recognition.save_error'),
    },
    gate,
    onGoToCamera,
    showProviderHint: availableAccounts.length === 0,
    onGoToProvider: () => navigate(ADD_PROVIDER_ROUTE),

    deviceId: device.id,
    accountOptions,
    selectedAccountId: draft.accountId,
    selectedAccountName,
    onSelectAccount: (id) => patchDraft({ accountId: id }),
    hasSavedRecognition: device.recognition != null,

    model: draft.model,
    onModelChange: (value) => patchDraft({ model: value }),
    promptTemplate: draft.promptTemplate,
    onPromptTemplateChange: (value) => patchDraft({ promptTemplate: value }),

    autoIdentify: draft.autoIdentify,
    onToggleAutoIdentify: (checked) => patchDraft({ autoIdentify: checked }),

    pets: petRows,
    onToggleWatched: handleToggleWatched,
    onConfirmAddImages: handleConfirmAddImages,
    onRemoveImage: handleRemoveImage,

    onSubmit: handleSubmit,
    onCancel: requestReset,
    isDirty,
    isSaving,
    saveFailed,

    discardConfirm,
    disabled: isSaving,
  };

  return <RecognitionTabView {...viewProps} />;
};

export default RecognitionTab;
