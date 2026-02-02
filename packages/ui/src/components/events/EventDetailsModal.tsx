import * as React from 'react';
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
  const data = event.data as { duration?: number; amount?: number };
  return (
    <div className="event-specific-details">
      {data.duration && (
        <span className="detail-item">Duration: {data.duration}s</span>
      )}
      {data.amount && (
        <span className="detail-item">Amount: {data.amount}ml</span>
      )}
    </div>
  );
};

const EventDetailsRenderer: React.FC<{ event: GetEventDTO }> = ({ event }) => {
  switch (event.data.type) {
    case 'water_intake':
      return <WaterIntakeDetails event={event} />;
    default:
      return <p className="text-muted">No additional details available.</p>;
  }
};

const getEventTitle = (event: GetEventDTO) => {
  switch (event.data?.type) {
    case 'water_intake':
      return 'Water Intake';
    case 'litterbox_use':
      return 'Litterbox Usage';
    case 'litterbox_maintenance':
      return 'Litterbox Maintenance';
    default:
      return 'Event Detected';
  }
};

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

const ELIMINATION_TYPE_OPTIONS: {
  value: LitterboxUseEliminationType;
  label: string;
}[] = [
    { value: 'urination', label: 'Urination' },
    { value: 'defecation', label: 'Defecation' },
    { value: 'both', label: 'Both' },
    { value: 'no_elimination', label: 'No Elimination' },
    { value: 'unknown', label: 'Unknown' },
  ];

const EventDetailsModal: React.FC<EventDetailsModalProps> = ({
  event,
  isOpen,
  onClose,
}) => {
  const { data: pets } = usePets();
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
  }, [hasAnalysisData, decodedRawData?.weights]);

  if (!event) {
    return null;
  }

  const handlePetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = e.target.value;
    setSelectedPetId(newValue);

    const petId = newValue === 'null' ? null : parseInt(newValue, 10);

    updateEvent({
      eventId: event.id,
      data: { pet_id: petId },
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
      },
    });
  };

  const petOptions = pets
    ? [
      { value: 'null', label: 'Unknown' },
      ...pets.map((p) => ({ value: String(p.id), label: p.name })),
    ]
    : [{ value: 'null', label: 'Unknown' }];

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
              Media
            </button>
            <button
              className={`tab-button ${activeTab === 'analysis' ? 'active' : ''}`}
              onClick={() => setActiveTab('analysis')}
            >
              <Activity size={16} />
              Analysis
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
                  <p>No media available</p>
                </div>
              )}
              {!isLoadingMedia && hasMedia && (
                <div className="media-gallery">
                  {media.map((m) => (
                    <div key={m.id} className="media-item">
                      {m.mime_type.startsWith('image/') && (
                        <img src={`/api/media/${m.file_path}`} alt="Event media" />
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
                {getEventTitle(event)}
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
                title="Delete Event"
              >
                <Trash2 size={20} />
              </Button>
              {hasMedia && (
                <Button
                  variant="ghost"
                  icon
                  className="action-btn"
                  title="Download Media"
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
              <span>Pet Identification</span>
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
                <span>Event Type</span>
              </div>
              <div className="elimination-type-selector-wrapper">
                <Select
                  options={ELIMINATION_TYPE_OPTIONS}
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
