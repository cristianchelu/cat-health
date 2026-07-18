import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { FormActions } from '@/components/ui/form';
import { LoadingState } from '@/components/ui/PageState';
import { Check } from 'lucide-react';
import { usePet } from '@/hooks/queries/petQueries';
import { useVerifiedEventMedia } from '@/hooks/queries/eventQueries';
import './ReferenceImagePicker.css';

interface ReferenceImagePickerProps {
  isOpen: boolean;
  onClose: () => void;
  petId: number;
  sourceDeviceId: number;
  onSelect: (mediaIds: number[]) => void;
}

const ReferenceImagePicker: React.FC<ReferenceImagePickerProps> = ({
  isOpen,
  onClose,
  petId,
  sourceDeviceId,
  onSelect,
}) => {
  const { t } = useTranslation();

  const { data: pet } = usePet(petId, isOpen);
  const { data: candidateMedia, isLoading } = useVerifiedEventMedia(
    sourceDeviceId,
    petId,
    isOpen,
  );
  const [selectedIds, setSelectedIds] = React.useState<Set<number>>(new Set());
  const [displayCount, setDisplayCount] = React.useState(50); // Show 50 at a time

  // Reset display count when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setDisplayCount(50);
    }
  }, [isOpen]);

  const displayedMedia = candidateMedia?.slice(0, displayCount) || [];
  const hasMore = candidateMedia && candidateMedia.length > displayCount;

  const toggleSelection = (mediaId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(mediaId)) {
        next.delete(mediaId);
      } else {
        next.add(mediaId);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    if (!candidateMedia) return;
    onSelect(Array.from(selectedIds));
    setSelectedIds(new Set());
  };

  const handleCancel = () => {
    setSelectedIds(new Set());
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleCancel}>
      <DialogContent className="reference-image-picker-content">
        <DialogTitle>
          {pet?.name
            ? t('pet_recognizer.picker_title', { name: pet.name })
            : t('pet_recognizer.picker_title_fallback')}
        </DialogTitle>

        <p className="picker-description">
          {pet?.name ? t('pet_recognizer.picker_description', { name: pet.name }) : ''}
          {candidateMedia && (
            <span className="total-count">
              {' '}({t('pet_recognizer.images_available', { count: candidateMedia.length })})
            </span>
          )}
        </p>

        <div className="media-grid-container">
          {isLoading && (
            <LoadingState message={t('pet_recognizer.loading_images')} />
          )}

          {!isLoading && candidateMedia && candidateMedia.length === 0 && (
            <div className="empty-state">
              <p>
                {t('pet_recognizer.picker_no_images', { name: pet?.name ?? '' })}
              </p>
              <p className="help-text">
                {t('pet_recognizer.picker_help')}
              </p>
            </div>
          )}

          {!isLoading && candidateMedia && candidateMedia.length > 0 && (
            <>
              <div className="media-grid">
                {displayedMedia.map((media) => (
                  <div
                    key={media.id}
                    className={`media-item ${selectedIds.has(media.id) ? 'selected' : ''}`}
                    onClick={() => toggleSelection(media.id)}
                  >
                    <img
                      src={`api/media/${media.file_path}`}
                      alt={t('pet_recognizer.event_snapshot_alt')}
                    />
                    {selectedIds.has(media.id) && (
                      <div className="selected-indicator">
                        <Check size={20} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {hasMore && (
                <div className="load-more-container">
                  <Button
                    variant="secondary"
                    onClick={() => setDisplayCount((prev) => prev + 50)}
                  >
                    {t('pet_recognizer.load_more_remaining', {
                      count: candidateMedia.length - displayCount,
                    })}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        <FormActions
          className="picker-actions"
          onCancel={handleCancel}
          cancelLabel={t('settings.cancel')}
          submitLabel={t('pet_recognizer.add_images', {
            count: selectedIds.size,
          })}
          submitType="button"
          onSubmitClick={handleConfirm}
          submitDisabled={selectedIds.size === 0}
        />
      </DialogContent>
    </Dialog>
  );
};

export default ReferenceImagePicker;
