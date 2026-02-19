import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { usePets } from '@/hooks/queries/petQueries';
import { useEventMedia, useUpdateEvent } from '@/hooks/queries/eventQueries';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/form/Select';
import type {
  GetEventDTO,
  LitterboxUseEliminationType,
} from 'shared';
import WeightSignalChart from './WeightSignalChart';
import { LitterboxStateTracker } from './litterboxStateTracker';
import { decodeLitterboxRawData } from './decodeLitterboxRawData';

import './EventDetailsModal.css';
import { Loader2, Trash2, Download, Info, Image, Activity } from 'lucide-react';

interface EventDetailsModalProps {
  event: GetEventDTO | null;
  isOpen: boolean;
  onClose: () => void;
}

const WaterIntakeDetails: React.FC<{ event: GetEventDTO }> = ({ event }) => {
  const { t } = useTranslation();
  const data = event.data as { duration?: number; amount?: number };
  return (
    <div className="event-specific-details">
      {data.duration != null && (
        <span className="detail-item">{t('event_details.duration_seconds', { seconds: data.duration })}</span>
      )}
      {data.amount != null && (
        <span className="detail-item">{t('event_details.amount_ml', { amount: data.amount })}</span>
      )}
    </div>
  );
};

const EventDetailsRenderer: React.FC<{ event: GetEventDTO }> = ({ event }) => {
  const { t } = useTranslation();
  switch (event.data.type) {
    case 'water_intake':
      return <WaterIntakeDetails event={event} />;
    default:
      return <p className="text-muted">{t('event_details.no_additional_details')}</p>;
  }
};

function getEventTitle(event: GetEventDTO, t: (key: string) => string): string {
  switch (event.data?.type) {
    case 'water_intake':
      return t('event_details.water_intake');
    case 'litterbox_use':
      return t('event_details.litterbox_usage');
    case 'litterbox_maintenance':
      return t('event_details.litterbox_maintenance');
    default:
      return t('event_details.event_detected');
  }
}

const formatEventTime = (timestamp: string | number | Date) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: 'numeric',
    hour12: true,
    month: 'short',
    day: 'numeric',
  }).format(date);
};

const EventDetailsModal: React.FC<EventDetailsModalProps> = ({
  event,
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation();
  const { data: pets } = usePets();

  const eliminationTypeOptions: { value: LitterboxUseEliminationType; label: string }[] = [
    { value: 'urination', label: t('overview.urination') },
    { value: 'defecation', label: t('overview.defecation') },
    { value: 'both', label: t('overview.both') },
    { value: 'no_elimination', label: t('overview.no_elimination') },
    { value: 'unknown', label: t('common.unknown') },
  ];
  const { data: media, isLoading: isLoadingMedia } = useEventMedia(
    event?.id ?? 0,
    isOpen && event !== null,
  );
  const { mutate: updateEvent, isPending: isUpdating } = useUpdateEvent();

  const [selectedPetId, setSelectedPetId] = React.useState<string | null>(null);
  const [selectedEliminationType, setSelectedEliminationType] =
    React.useState<LitterboxUseEliminationType>('unknown');
  const [activeTab, setActiveTab] = React.useState<'media' | 'analysis'>('media');

  React.useEffect(() => {
    if (event) {
      setSelectedPetId(event.pet_id ? String(event.pet_id) : 'null');
      if (event.data?.type === 'litterbox_use' && event.data.elimination_type) {
        setSelectedEliminationType(event.data.elimination_type);
      } else if (event.data?.type === 'litterbox_use') {
        setSelectedEliminationType('unknown');
      }
      // Reset to media tab when event changes
      setActiveTab('media');
    }
  }, [event]);

  const decodedRawData = React.useMemo(() => {
    if (event?.data?.type !== 'litterbox_use') return null;
    return decodeLitterboxRawData(event?.raw_data);
  }, [event?.data?.type, event?.raw_data]);

  // Check if event has analysis data
  const hasAnalysisData =
    event?.data?.type === 'litterbox_use' &&
    (decodedRawData?.weights?.length ?? 0) > 0;

  // Compute analysis result when needed
  const analysisResult = React.useMemo(() => {
    if (!hasAnalysisData || !decodedRawData?.weights) return null;
    const tracker = new LitterboxStateTracker();
    return tracker.processEvent(decodedRawData.weights);
  }, [hasAnalysisData, decodedRawData]);

  if (!event) {
    return null;
  }

  const handlePetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = e.target.value;
    setSelectedPetId(newValue);

    const petId = newValue === 'null' ? null : parseInt(newValue, 10);

    updateEvent({
      eventId: event.id,
      data: { pet_id: petId, human_verified: true },
    });
  };

  const handleEliminationTypeChange = (
    e: React.ChangeEvent<HTMLSelectElement>,
  ) => {
    const newValue = e.target.value as LitterboxUseEliminationType;
    setSelectedEliminationType(newValue);

    if (event.data?.type !== 'litterbox_use') return;

    updateEvent({
      eventId: event.id,
      data: {
        data: {
          ...event.data,
          elimination_type: newValue,
        },
        human_verified: true,
      },
    });
  };

  const petOptions = pets
    ? [
      { value: 'null', label: t('common.unknown') },
      ...pets.map((p) => ({ value: String(p.id), label: p.name })),
    ]
    : [{ value: 'null', label: t('common.unknown') }];

  const hasMedia = media && media.length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="event-details-modal-content">
        {/* Tab buttons - only show if analysis data exists */}
        {hasAnalysisData && (
          <div className="event-tabs">
            <button
              className={`tab-button ${activeTab === 'media' ? 'active' : ''}`}
              onClick={() => setActiveTab('media')}
            >
              <Image size={16} />
              {t('event_details.media')}
            </button>
            <button
              className={`tab-button ${activeTab === 'analysis' ? 'active' : ''}`}
              onClick={() => setActiveTab('analysis')}
            >
              <Activity size={16} />
              {t('event_details.analysis')}
            </button>
          </div>
        )}

        <div className="event-details-media-section">
          {activeTab === 'media' && (
            <>
              {isLoadingMedia && (
                <div className="media-loading">
                  <Loader2 className="animate-spin" />
                </div>
              )}
              {!isLoadingMedia && !hasMedia && (
                <div className="media-placeholder">
                  <p>{t('event_details.no_media_available')}</p>
                </div>
              )}
              {!isLoadingMedia && hasMedia && (
                <div className="media-gallery">
                  {media.map((m) => (
                    <div key={m.id} className="media-item">
                      {m.mime_type.startsWith('image/') && (
                        <img src={`/api/media/${m.file_path}`} alt={t('event_details.event_media_alt')} />
                      )}
                      {m.mime_type.startsWith('video/') && (
                        <video controls src={`/api/media/${m.file_path}`} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          {activeTab === 'analysis' && analysisResult && decodedRawData && (
            <WeightSignalChart
              weights={decodedRawData.weights}
              periods={analysisResult.periods}
            />
          )}
        </div>

        <div className="event-details-body">
          <div className="event-header-row">
            <div className="event-info">
              <DialogTitle className="event-title">
                {getEventTitle(event, t)}
              </DialogTitle>
              <span className="event-time">
                {formatEventTime(event.timestamp)}
              </span>
            </div>
            <div className="event-actions">
              <Button
                variant="ghost"
                icon
                className="action-btn"
                title={t('event_details.delete_event')}
              >
                <Trash2 size={20} />
              </Button>
              {hasMedia && (
                <Button
                  variant="ghost"
                  icon
                  className="action-btn"
                  title={t('event_details.download_media')}
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = `/api/media/${media[0].file_path}`;
                    link.download =
                      media[0].file_path.split('/').pop() || 'media';
                    link.click();
                  }}
                >
                  <Download size={20} />
                </Button>
              )}
            </div>
          </div>

          <div className="event-section pet-identification-section">
            <div className="section-label">
              <Info size={14} className="info-icon" />
              <span>{t('event_details.pet_identification')}</span>
            </div>
            <div className="pet-selector-wrapper">
              <Select
                options={petOptions}
                value={selectedPetId ?? ''}
                onChange={handlePetChange}
                className="pet-select"
                disabled={isUpdating}
              />
            </div>
          </div>

          {event.data?.type === 'litterbox_use' && (
            <div className="event-section elimination-type-section">
              <div className="section-label">
                <Info size={14} className="info-icon" />
                <span>{t('event_details.event_type')}</span>
              </div>
              <div className="elimination-type-selector-wrapper">
                <Select
                  options={eliminationTypeOptions}
                  value={selectedEliminationType}
                  onChange={handleEliminationTypeChange}
                  className="elimination-type-select"
                  disabled={isUpdating}
                />
              </div>
            </div>
          )}

          <div className="event-section details-section">
            <EventDetailsRenderer event={event} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EventDetailsModal;
