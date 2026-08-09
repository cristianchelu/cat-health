import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import type {
  DeviceListItemDTO,
  GetDeviceResponseDTO,
  PetRecognizerConfig,
} from 'shared';
import {
  addDraftReferenceImages,
  buildRecognizerConfigPatch,
  draftFromRecognizerConfig,
  isPetWatched,
  parsePetRecognizerConfig,
  recognitionDraftEqual,
  removeDraftReferenceImage,
  resolveRecognitionGate,
  setPetWatched,
  type RecognitionDraft,
} from '@/lib/petRecognizerDraft';
import {
  listPetRecognizers,
  resolveRecognizersForDevice,
} from '@/lib/resolveRecognizersForDevice';
import { backState } from '@/lib/navigationBack';
import { useDraftForm } from '@/hooks/form';
import { usePetContext } from '@/hooks/context/usePetContext';
import {
  useAssignDeviceRecognizer,
  useDevices,
  useProviderAccounts,
  useUpdateDevice,
} from '@/hooks/queries/deviceQueries';
import {
  RecognitionTabView,
  type RecognitionTabViewProps,
  type RecognizerPickerOption,
  type TrainedPetRow,
} from '@/components/devices/recognition';

const ADD_DEVICE_ROUTE = '/settings/devices/new';
const ADD_PROVIDER_ROUTE = '/settings/providers/new';

const EMPTY_DRAFT: RecognitionDraft = {
  autoIdentify: false,
  ignoredPets: [],
  referenceImages: {},
};

interface RecognizerEntry {
  device: DeviceListItemDTO;
  config: PetRecognizerConfig;
}

interface RecognitionTabProps {
  device: GetDeviceResponseDTO;
  onDirtyChange?: (dirty: boolean) => void;
  onGoToCamera: () => void;
}

function toRecognizerEntry(device: DeviceListItemDTO): RecognizerEntry | null {
  const config = parsePetRecognizerConfig(device.config);
  if (!config) return null;
  return { device, config };
}

/**
 * Wires the Recognition tab: the recognizer linked to this device (at most
 * one), the Change picker over every recognizer in the account, config draft,
 * and reference-image edits. RecognitionTabView stays presentational.
 */
const RecognitionTab: React.FC<RecognitionTabProps> = ({
  device,
  onDirtyChange,
  onGoToCamera,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: allDevices } = useDevices();
  const { pets } = usePetContext();
  const { data: accounts } = useProviderAccounts();

  const hasInferenceAccount = React.useMemo(
    () => (accounts ?? []).some((account) => account.provider === 'inference'),
    [accounts],
  );

  const allRecognizerEntries = React.useMemo<RecognizerEntry[]>(() => {
    const entries: RecognizerEntry[] = [];
    for (const recognizer of listPetRecognizers(allDevices ?? [])) {
      const entry = toRecognizerEntry(recognizer);
      if (entry) entries.push(entry);
    }
    return entries;
  }, [allDevices]);

  const linkedEntry = React.useMemo(() => {
    const linked = resolveRecognizersForDevice(device.id, allDevices ?? []);
    for (const recognizer of linked) {
      const entry = toRecognizerEntry(recognizer);
      if (entry) return entry;
    }
    return undefined;
  }, [allDevices, device.id]);

  const hasCameraLink = device.camera_link != null;
  const gate = resolveRecognitionGate({
    hasCameraLink,
    recognizerCount: allRecognizerEntries.length,
  });

  const baselineConfig = linkedEntry?.config;
  const baselineKey = linkedEntry
    ? `${linkedEntry.device.id}:${JSON.stringify(linkedEntry.config)}`
    : 'none';
  const baseline = React.useMemo(
    () =>
      baselineConfig ? draftFromRecognizerConfig(baselineConfig) : EMPTY_DRAFT,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- baselineKey drives sync
    [baselineKey],
  );

  const {
    draft,
    setDraft,
    patchDraft,
    isDirty,
    commit,
    requestDiscard,
    requestReset,
    discardConfirm,
  } = useDraftForm(baseline, {
    baselineKey,
    isEqual: recognitionDraftEqual,
  });

  React.useEffect(() => {
    onDirtyChange?.(isDirty);
    return () => onDirtyChange?.(false);
  }, [isDirty, onDirtyChange]);

  const updateDeviceMutation = useUpdateDevice(linkedEntry?.device.id ?? 0);

  const assignRecognizerMutation = useAssignDeviceRecognizer(device.id);

  const handleSelectRecognizer = (id: number) => {
    requestDiscard(() => {
      assignRecognizerMutation.mutate(id);
    });
  };

  const handleToggleAutoIdentify = (checked: boolean) => {
    patchDraft({ autoIdentify: checked });
  };

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
    if (!isDirty || !linkedEntry || !baselineConfig) return;
    const patch = buildRecognizerConfigPatch(baselineConfig, draft);
    updateDeviceMutation.mutate(
      { config: patch },
      { onSuccess: () => commit() },
    );
  };

  const recognizerOptions: RecognizerPickerOption[] = allRecognizerEntries.map(
    (entry) => ({
      id: entry.device.id,
      name: entry.device.name,
      model: entry.config.model,
    }),
  );

  const petRows: TrainedPetRow[] = pets.map((pet) => {
    const petKey = String(pet.id);
    const watched = isPetWatched(draft.ignoredPets, pet.id);
    const referenceIds = draft.referenceImages[petKey] ?? [];
    const media = linkedEntry?.device.reference_media?.[petKey] ?? [];
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

  const isBusy =
    updateDeviceMutation.isPending || assignRecognizerMutation.isPending;

  const viewProps: RecognitionTabViewProps = {
    copy: {
      lockedTitle: t('recognition.locked_title'),
      lockedCta: t('recognition.locked_cta'),
      providerHint: t('recognition.provider_hint'),
      providerCta: t('recognition.provider_cta'),
      emptyTitle: t('recognition.empty_title'),
      emptyCta: t('settings.add_device'),
      autoIdentifyLabel: t('recognition.auto_identify_label'),
      autoIdentifyHint: t('recognition.auto_identify_hint'),
      modelTitle: t('recognition.model_title'),
      modelSubtitle: t('recognition.model_subtitle'),
      modelNoneTitle: t('recognition.model_none_selected'),
      modelChangeLabel: t('camera_link.change_source'),
      modelSettingsLabel: t('recognition.model_settings'),
      pickerTitle: t('recognition.picker_title'),
      pickerEmpty: t('recognition.picker_empty'),
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
    showProviderHint: !hasInferenceAccount,
    onGoToProvider: () => navigate(ADD_PROVIDER_ROUTE),
    onAddDevice: () => navigate(ADD_DEVICE_ROUTE),

    sourceDeviceId: device.id,
    selectedRecognizerId: linkedEntry?.device.id,
    selectedRecognizerName: linkedEntry?.device.name,
    selectedRecognizerModel: linkedEntry?.config.model,
    recognizerOptions,
    onSelectRecognizer: handleSelectRecognizer,
    onOpenRecognizerSettings: (id) => {
      navigate(`/settings/devices/${id}`, {
        state: backState(`/devices/${device.id}`, device.name),
      });
    },

    autoIdentify: draft.autoIdentify,
    onToggleAutoIdentify: handleToggleAutoIdentify,

    pets: petRows,
    onToggleWatched: handleToggleWatched,
    onConfirmAddImages: handleConfirmAddImages,
    onRemoveImage: handleRemoveImage,

    onSubmit: handleSubmit,
    onCancel: requestReset,
    isDirty,
    isSaving: isBusy,
    saveFailed:
      updateDeviceMutation.isError || assignRecognizerMutation.isError,

    discardConfirm,
    disabled: isBusy,
  };

  return <RecognitionTabView {...viewProps} />;
};

export default RecognitionTab;
