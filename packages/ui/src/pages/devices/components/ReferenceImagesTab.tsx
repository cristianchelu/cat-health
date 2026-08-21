import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { usePetContext } from '@/hooks/context/usePetContext';
import { useUpdateDevice } from '@/hooks/queries/deviceQueries';
import { Button } from '@/components/ui/Button';
import Avatar from '@/components/ui/Avatar';
import { MediaGrid } from '@/components/ui/MediaGrid';
import { MediaTile } from '@/components/ui/MediaTile';
import { Switch } from '@/components/ui/Switch';
import { cn } from '@/lib/utils';
import { Cat, ImagePlus, X, Sparkles } from 'lucide-react';
import type { GetDeviceResponseDTO, PetRecognizerConfig } from 'shared';
import ReferenceImagePicker from '@/components/devices/ReferenceImagePicker';
import TestRecognitionModal from '@/components/devices/TestRecognitionModal';
import './ReferenceImagesTab.css';

interface ReferenceImagesTabProps {
  device: GetDeviceResponseDTO;
}

const ReferenceImagesTab: React.FC<ReferenceImagesTabProps> = ({ device }) => {
  const { t } = useTranslation();
  const { pets } = usePetContext();
  const { mutate: updateDevice } = useUpdateDevice(device.id);
  const [selectedPetId, setSelectedPetId] = React.useState<number | null>(null);
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
    const updatedIds = currentIds.filter((id) => id !== mediaId);

    const updatedConfig = {
      ...config,
      reference_images: {
        ...referenceImages,
        [petIdStr]: updatedIds,
      },
    };

    updateDevice({ config: updatedConfig });
  };

  const handleAddImages = (petId: number, mediaIds: number[]) => {
    const petIdStr = petId.toString();
    const currentIds = referenceImages[petIdStr] || [];
    const updatedIds = [...currentIds, ...mediaIds];

    const updatedConfig = {
      ...config,
      reference_images: {
        ...referenceImages,
        [petIdStr]: updatedIds,
      },
    };

    updateDevice({ config: updatedConfig });
    setIsPickerOpen(false);
  };

  const openPicker = (petId: number) => {
    setSelectedPetId(petId);
    setIsPickerOpen(true);
  };

  return (
    <div className="reference-images-tab">
      <div className="tab-header">
        <div className="tab-description">
          <p>{t('pet_recognizer.tab_description')}</p>
          <p>{t('pet_recognizer.watch_help')}</p>
        </div>
        <Button
          variant="secondary"
          onClick={() => setIsTestModalOpen(true)}
          className="test-button"
        >
          <Sparkles size="1em" />
          {t('pet_recognizer.test_recognition')}
        </Button>
      </div>

      <div className="pets-grid">
        {pets.map((pet) => {
          const petIdStr = pet.id.toString();
          const refs = referenceMedia?.[petIdStr] ?? [];
          const isWatched = !ignoredPets.has(pet.id);

          return (
            <div
              key={pet.id}
              className={cn('pet-card', !isWatched && 'is-ignored')}
            >
              <div className="pet-header">
                <Avatar
                  src={pet.avatar_url}
                  alt={pet.name}
                  fallbackIcon={<Cat size="1em" />}
                />
                <div className="pet-info">
                  <h3>{pet.name}</h3>
                  <span className="image-count">
                    {isWatched
                      ? t('pet_recognizer.reference_images_count', {
                          count: refs.length,
                        })
                      : t('pet_recognizer.pet_not_watched')}
                  </span>
                </div>
                <Switch
                  checked={isWatched}
                  onCheckedChange={(checked) =>
                    handleWatchedChange(pet.id, checked)
                  }
                  aria-label={t('pet_recognizer.watch_pet_label', {
                    name: pet.name,
                  })}
                  title={t('pet_recognizer.watch_pet_label', {
                    name: pet.name,
                  })}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  icon
                  onClick={() => openPicker(pet.id)}
                  className="add-images-button"
                  title={t('pet_recognizer.add_from_events')}
                >
                  <ImagePlus size={18} />
                </Button>
              </div>

              {refs.length > 0 && (
                <MediaGrid size="sm">
                  {refs.map((ref) => (
                    /* Positions the remove control, which overhangs the tile. */
                    <div key={ref.id} className="image-item">
                      <MediaTile
                        src={`api/media/${ref.file_path}`}
                        alt={t('pet_recognizer.reference_for_alt', {
                          name: pet.name,
                        })}
                      />
                      <button
                        className="remove-button"
                        onClick={() => handleRemoveImage(pet.id, ref.id)}
                        title={t('pet_recognizer.remove_image')}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </MediaGrid>
              )}
            </div>
          );
        })}
      </div>

      {selectedPetId !== null && (
        <ReferenceImagePicker
          isOpen={isPickerOpen}
          onClose={() => setIsPickerOpen(false)}
          petId={selectedPetId}
          sourceDeviceId={config.source_device_id}
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
