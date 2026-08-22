import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { PawPrint, Sparkles } from 'lucide-react';
import { usePetContext } from '@/hooks/context/usePetContext';
import { useUpdateDevice } from '@/hooks/queries/deviceQueries';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import {
  TrainedPetsEditor,
  type TrainedPetRow,
} from '@/components/devices/recognition';
import type { GetDeviceResponseDTO, PetRecognizerConfig } from 'shared';
import ReferenceImagePicker from '@/components/devices/ReferenceImagePicker';
import TestRecognitionModal from '@/components/devices/TestRecognitionModal';
import './ReferenceImagesTab.css';

interface ReferenceImagesTabProps {
  device: GetDeviceResponseDTO;
}

/**
 * The recognizer device's own view of who it is trained on.
 *
 * The same `TrainedPetsEditor` the Recognition tab uses, because this asks the
 * user the identical question from the other end of the link — a device's
 * recognizer, rather than a recognizer's device.
 */
const ReferenceImagesTab: React.FC<ReferenceImagesTabProps> = ({ device }) => {
  const { t } = useTranslation();
  const { pets } = usePetContext();
  const { mutate: updateDevice } = useUpdateDevice(device.id);
  const [selectedPetId, setSelectedPetId] = React.useState<number | null>(null);
  const [expandedPetId, setExpandedPetId] = React.useState<number | null>(null);
  const [isPickerOpen, setIsPickerOpen] = React.useState(false);
  const [isTestModalOpen, setIsTestModalOpen] = React.useState(false);

  const config = device.config as PetRecognizerConfig;
  const referenceImages = config.reference_images || {};
  const ignoredPets = React.useMemo(
    () => new Set(config.ignored_pets ?? []),
    [config.ignored_pets],
  );
  const referenceMedia = (device as Record<string, unknown>).reference_media as
    | Record<string, Array<{ id: number; file_path: string }>>
    | undefined;

  /**
   * Stored as the excluded ids, not the included ones, so a pet adopted after
   * this device was set up is watched for by default — the same thing that
   * happened before the field existed. An empty list is dropped rather than
   * written, which keeps a device nobody has excluded anything on identical to
   * one that predates the feature.
   */
  const handleWatchedChange = (petId: number, watched: boolean) => {
    const next = new Set(ignoredPets);
    if (watched) next.delete(petId);
    else next.add(petId);

    const nextConfig: PetRecognizerConfig = {
      ...config,
      ignored_pets: [...next],
    };
    if (next.size === 0) delete nextConfig.ignored_pets;

    updateDevice({ config: nextConfig });
  };

  const handleRemoveImage = (petId: number, mediaId: number) => {
    const petIdStr = petId.toString();
    const currentIds = referenceImages[petIdStr] || [];

    updateDevice({
      config: {
        ...config,
        reference_images: {
          ...referenceImages,
          [petIdStr]: currentIds.filter((id) => id !== mediaId),
        },
      },
    });
  };

  const handleAddImages = (petId: number, mediaIds: number[]) => {
    const petIdStr = petId.toString();
    const currentIds = referenceImages[petIdStr] || [];

    updateDevice({
      config: {
        ...config,
        reference_images: {
          ...referenceImages,
          [petIdStr]: [...currentIds, ...mediaIds],
        },
      },
    });
    setIsPickerOpen(false);
  };

  const openPicker = (petId: number) => {
    setSelectedPetId(petId);
    setIsPickerOpen(true);
  };

  const petRows: TrainedPetRow[] = pets.map((pet) => {
    const petKey = String(pet.id);
    const media = referenceMedia?.[petKey] ?? [];
    const watched = !ignoredPets.has(pet.id);

    return {
      id: pet.id,
      name: pet.name,
      avatarUrl: pet.avatar_url,
      isWatched: watched,
      watchAriaLabel: t('pet_recognizer.watch_pet_label', { name: pet.name }),
      statusLabel: watched
        ? t('pet_recognizer.reference_images_count', { count: media.length })
        : t('pet_recognizer.pet_not_watched'),
      thumbs: media.map((item) => ({
        id: item.id,
        url: `api/media/${item.file_path}`,
        alt: t('pet_recognizer.reference_for_alt', { name: pet.name }),
      })),
      referenceImageIds: referenceImages[petKey] ?? [],
      expandLabel: t('pet_recognizer.expand_pet_row', { name: pet.name }),
      addImagesLabel: t('pet_recognizer.add_from_events'),
      removeImageLabel: t('pet_recognizer.remove_image'),
    };
  });

  const selectedPetRow = petRows.find((row) => row.id === selectedPetId);

  return (
    <div className="reference-images-tab">
      <SectionHeader
        icon={<PawPrint aria-hidden="true" />}
        subtitle={t('recognition.trained_pets_subtitle')}
      >
        {t('recognition.trained_pets_title')}
      </SectionHeader>

      <Card className="reference-images-card">
        <CardContent noPadding>
          <TrainedPetsEditor
            pets={petRows}
            emptyLabel={t('recognition.trained_pets_empty')}
            expandedPetId={expandedPetId}
            onToggleExpand={(petId) =>
              setExpandedPetId((current) => (current === petId ? null : petId))
            }
            onToggleWatched={handleWatchedChange}
            onAddImages={openPicker}
            onRemoveImage={handleRemoveImage}
          />
          {/* A tool acting on this card's own content, so it stays left. */}
          <div className="reference-images-tools">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsTestModalOpen(true)}
            >
              <Sparkles size="1em" />
              {t('pet_recognizer.test_recognition')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {selectedPetId !== null && (
        <ReferenceImagePicker
          isOpen={isPickerOpen}
          onClose={() => setIsPickerOpen(false)}
          petId={selectedPetId}
          sourceDeviceId={config.source_device_id}
          excludeMediaIds={selectedPetRow?.referenceImageIds}
          onSelect={(mediaIds) => handleAddImages(selectedPetId, mediaIds)}
        />
      )}

      <TestRecognitionModal
        isOpen={isTestModalOpen}
        onClose={() => setIsTestModalOpen(false)}
        deviceId={device.id}
        sourceDeviceId={config.source_device_id}
      />
    </div>
  );
};

export default ReferenceImagesTab;
