import * as React from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { EmptyState, LoadingState } from '@/components/ui/PageState';
import { MediaGrid } from '@/components/ui/MediaGrid';
import { MediaTile } from '@/components/ui/MediaTile';
import { CheckCircle, XCircle } from 'lucide-react';
import apiClient from '@/api/apiClient';
import { testDeviceIdentification } from '@/api/devices';
import { useQuery, useMutation } from '@tanstack/react-query';
import type {
  GetEventsResponseDTO,
  GetEventMediaResponseDTO,
  EventCauseDTO,
} from 'shared';
import { causeLabelKey } from '@/lib/eventAttribution';
import './TestRecognitionModal.css';

interface TestRecognitionModalProps {
  isOpen: boolean;
  onClose: () => void;
  deviceId: number;
  sourceDeviceId: number;
}

interface TestResult {
  mediaId: number;
  petName: string;
  /** `'error'` is the local failure marker, not a verdict from the model. */
  causedBy: EventCauseDTO | 'error';
  rawResponse: string;
  isCorrect: boolean | null;
}

const TestRecognitionModal: React.FC<TestRecognitionModalProps> = ({
  isOpen,
  onClose,
  deviceId,
  sourceDeviceId,
}) => {
  const { t } = useTranslation();
  const [testResults, setTestResults] = React.useState<Map<number, TestResult>>(
    new Map(),
  );
  const [pendingTestIds, setPendingTestIds] = React.useState<Set<number>>(
    new Set(),
  );

  const testMutation = useMutation({
    mutationFn: async ({
      mediaId,
      actualPetId,
    }: {
      mediaId: number;
      actualPetId: number | null;
    }) => {
      const response = await testDeviceIdentification(deviceId, {
        media_id: mediaId,
      });
      return { mediaId, actualPetId, response };
    },
    onSuccess: ({ mediaId, actualPetId, response }) => {
      setTestResults((prev) =>
        new Map(prev).set(mediaId, {
          mediaId,
          petName: response.pet_name,
          causedBy: response.caused_by,
          rawResponse: response.raw_response,
          isCorrect: actualPetId !== null && response.pet_id === actualPetId,
        }),
      );
    },
    onError: (error, { mediaId }) => {
      setTestResults((prev) =>
        new Map(prev).set(mediaId, {
          mediaId,
          petName: 'error',
          causedBy: 'error',
          rawResponse:
            error instanceof Error
              ? error.message
              : t('pet_recognizer.unknown_error'),
          isCorrect: false,
        }),
      );
    },
    onSettled: (_data, _error, { mediaId }) => {
      setPendingTestIds((prev) => {
        const next = new Set(prev);
        next.delete(mediaId);
        return next;
      });
    },
  });

  const handleTest = (mediaId: number, actualPetId: number | null) => {
    setPendingTestIds((prev) => new Set(prev).add(mediaId));
    testMutation.mutate({ mediaId, actualPetId });
  };

  // Fetch all verified event media from source device (all pets)
  const { data: allMedia, isLoading } = useQuery({
    queryKey: ['testRecognitionMedia', sourceDeviceId],
    queryFn: async () => {
      const { data: eventsResponse } =
        await apiClient.get<GetEventsResponseDTO>('/events', {
          params: {
            device_id: sourceDeviceId,
            human_verified: true,
            limit: 100,
          },
        });

      const allMedia: Array<
        GetEventMediaResponseDTO[number] & {
          actualPetId: number | null;
          actualPetName: string;
        }
      > = [];
      for (const event of eventsResponse.data) {
        try {
          const { data: media } = await apiClient.get<GetEventMediaResponseDTO>(
            `/events/${event.id}/media`,
          );
          for (const m of media) {
            allMedia.push({
              ...m,
              actualPetId: event.pet_id,
              actualPetName: event.pet_id
                ? i18n.t('pet_recognizer.known')
                : i18n.t('pet_recognizer.unknown'),
            });
          }
        } catch (error) {
          console.error(`Failed to fetch media for event ${event.id}:`, error);
        }
      }

      return allMedia;
    },
    enabled: isOpen,
  });

  const handleClose = () => {
    setTestResults(new Map());
    setPendingTestIds(new Set());
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="test-recognition-modal-content">
        <DialogTitle>{t('pet_recognizer.test_modal_title')}</DialogTitle>

        <p className="modal-description">
          {t('pet_recognizer.test_modal_description')}
          {allMedia && (
            <span className="total-count">
              {' '}
              (
              {t('pet_recognizer.images_available', { count: allMedia.length })}
              )
            </span>
          )}
        </p>

        <div className="media-grid-container">
          {isLoading && (
            <LoadingState message={t('pet_recognizer.loading_images')} />
          )}

          {!isLoading && allMedia && allMedia.length === 0 && (
            <EmptyState
              message={t('pet_recognizer.no_verified_images_device')}
            />
          )}

          {!isLoading && allMedia && allMedia.length > 0 && (
            <MediaGrid>
              {allMedia.slice(0, 50).map((media) => {
                const result = testResults.get(media.id);
                const isTesting = pendingTestIds.has(media.id);

                return (
                  <MediaTile
                    key={media.id}
                    src={`api/media/${media.file_path}`}
                    alt={t('pet_recognizer.test_image_alt')}
                    busy={isTesting}
                    onClick={() => handleTest(media.id, media.actualPetId)}
                    footerTone={result?.isCorrect ? 'ok' : 'error'}
                    footer={
                      result && (
                        <>
                          {result.isCorrect ? (
                            <CheckCircle size={20} aria-hidden="true" />
                          ) : (
                            <XCircle size={20} aria-hidden="true" />
                          )}
                          <span>
                            {result.causedBy === 'error'
                              ? t('pet_recognizer.unknown_error')
                              : result.causedBy === 'pet' ||
                                  result.causedBy === 'unknown'
                                ? result.petName
                                : t(causeLabelKey(result.causedBy))}
                          </span>
                        </>
                      )
                    }
                  />
                );
              })}
            </MediaGrid>
          )}
        </div>

        <div className="modal-actions">
          <Button variant="secondary" onClick={handleClose}>
            {t('pet_recognizer.close')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TestRecognitionModal;
