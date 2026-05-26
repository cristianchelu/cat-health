import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { getEventById } from '@/api/pets';
import { usePets } from '@/hooks/queries/petQueries';
import {
  useAnalyzeLitterboxEvent,
  useEventMedia,
  useUpdateEvent,
  useDeleteEvent,
} from '@/hooks/queries/eventQueries';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/form/Select';
import type {
  GetEventDTO,
  LitterboxAnalysisStatePeriod,
  LitterboxUseEliminationType,
} from 'shared';
import WeightSignalChart from './WeightSignalChart';
import WaterSignalChart from './WaterSignalChart';
import TimelapsePlayer from './TimelapsePlayer';
import { decodeLitterboxRawData } from './decodeLitterboxRawData';
import { decodeWaterRawData } from './decodeWaterRawData';
import { analyzeWaterSegments } from './analyzeWaterSegments';
import './EventDetailsModal.css';
import './TimelapsePlayer.css';
import {
  Loader2,
  Trash2,
  Download,
  Info,
  Image,
  Activity,
  Sparkles,
  Timer,
  GlassWater,
  DropletOff,
  X,
} from 'lucide-react';

const EMPTY_LITTERBOX_SEGMENT_PERIODS: LitterboxAnalysisStatePeriod[] = [];

interface EventDetailsModalProps {
  event: GetEventDTO | null;
  isOpen: boolean;
  onClose: () => void;
}

const WaterIntakeDetails: React.FC<{ event: GetEventDTO }> = ({ event }) => {
  const { t } = useTranslation();
  const data = event.data as {
    duration?: number;
    amount?: number;
    raw_amount?: number;
    excluded_amount?: number;
  };
  const hasFiltering =
    data.excluded_amount != null && data.excluded_amount > 0;
  return (
    <div className="event-specific-details">
      {data.duration != null && (
        <span className="detail-item">
          <Timer className="detail-item-icon" aria-hidden />
          <span className="detail-item-label">{t('event_details.duration_label')}</span>
          <span className="detail-item-value">
            {t('event_details.duration_value', { seconds: data.duration })}
          </span>
        </span>
      )}
      {data.amount != null && (
        <span className="detail-item">
          <GlassWater className="detail-item-icon" aria-hidden />
          <span className="detail-item-label">{t('event_details.amount_label')}</span>
          <span className="detail-item-value">
            {t('event_details.amount_value', { amount: data.amount })}
          </span>
        </span>
      )}
      {hasFiltering && (
        <span className="detail-item">
          <DropletOff className="detail-item-icon" aria-hidden />
          <span className="detail-item-label">{t('event_details.water_spilled_label')}</span>
          <span className="detail-item-value">
            {t('event_details.water_spilled_amount', { amount: data.excluded_amount })}
          </span>
        </span>
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
  const { mutate: deleteEventMutation, isPending: isDeleting } = useDeleteEvent();
  const { mutate: runAnalyze, isPending: isAnalyzing } = useAnalyzeLitterboxEvent();

  const eventId = event?.id;
  const { data: eventFromServer } = useQuery({
    queryKey: ['event', eventId ?? 0],
    queryFn: () => getEventById(eventId!),
    enabled: Boolean(isOpen && eventId),
  });

  const [selectedPetId, setSelectedPetId] = React.useState<string | null>(null);
  const [selectedEliminationType, setSelectedEliminationType] =
    React.useState<LitterboxUseEliminationType>('unknown');
  const [selectedStraining, setSelectedStraining] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<'media' | 'analysis'>('media');

  React.useEffect(() => {
    if (event) {
      setSelectedPetId(event.pet_id ? String(event.pet_id) : 'null');
      if (event.data?.type === 'litterbox_use' && event.data.elimination_type) {
        setSelectedEliminationType(event.data.elimination_type);
        setSelectedStraining(event.data.straining ?? false);
      } else if (event.data?.type === 'litterbox_use') {
        setSelectedEliminationType('unknown');
        setSelectedStraining(event.data.straining ?? false);
      }
      // Reset to media tab when event changes
      setActiveTab('media');
    }
  }, [event]);

  /** Prefer React Query payload so the modal stays in sync after mutations (e.g. reanalyze) while `event` from parent state may be stale. */
  const displayEvent = event ? (eventFromServer ?? event) : null;

  const decodedRawData = React.useMemo(() => {
    if (displayEvent?.data?.type !== 'litterbox_use') return null;
    return decodeLitterboxRawData(displayEvent.raw_data);
  }, [displayEvent?.data?.type, displayEvent?.raw_data]);

  const decodedWaterData = React.useMemo(() => {
    if (displayEvent?.data?.type !== 'water_intake') return null;
    return decodeWaterRawData(displayEvent.raw_data);
  }, [displayEvent?.data?.type, displayEvent?.raw_data]);

  // Check if event has analysis data
  const hasAnalysisData =
    (displayEvent?.data?.type === 'litterbox_use' &&
      (decodedRawData?.weights?.length ?? 0) > 0) ||
    (displayEvent?.data?.type === 'water_intake' &&
      (decodedWaterData?.weights?.length ?? 0) > 0);

  const litterboxData =
    displayEvent?.data?.type === 'litterbox_use'
      ? (displayEvent.data as {
          segments?: LitterboxAnalysisStatePeriod[] | null;
        })
      : null;

  const segmentPeriods: LitterboxAnalysisStatePeriod[] | null | undefined =
    litterboxData?.segments;

  const waterPeriods = React.useMemo(() => {
    const w = decodedWaterData?.weights;
    if (!w?.length) return [];
    return analyzeWaterSegments(w);
  }, [decodedWaterData]);

  const hasLitterboxChartWeights =
    displayEvent?.data?.type === 'litterbox_use' &&
    (decodedRawData?.weights?.length ?? 0) > 0;

  const hasWaterChartWeights =
    displayEvent?.data?.type === 'water_intake' &&
    (decodedWaterData?.weights?.length ?? 0) > 0;

  React.useEffect(() => {
    if (!eventFromServer || !event || eventFromServer.id !== event.id) return;
    setSelectedPetId(eventFromServer.pet_id ? String(eventFromServer.pet_id) : 'null');
    if (eventFromServer.data?.type === 'litterbox_use') {
      setSelectedEliminationType(
        eventFromServer.data.elimination_type ?? 'unknown',
      );
      setSelectedStraining(eventFromServer.data.straining ?? false);
    }
  }, [event, eventFromServer]);

  if (!event || !displayEvent) {
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

    if (displayEvent.data?.type !== 'litterbox_use') return;

    updateEvent({
      eventId: displayEvent.id,
      data: {
        data: {
          ...displayEvent.data,
          elimination_type: newValue,
          segments: null,
        },
        human_verified: true,
      },
    });
  };

  const handleStrainingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextStraining = e.target.checked;
    setSelectedStraining(nextStraining);

    if (displayEvent.data?.type !== 'litterbox_use') return;

    updateEvent({
      eventId: displayEvent.id,
      data: {
        data: {
          ...displayEvent.data,
          straining: nextStraining,
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

  const { imageFrames, videoItems, hasTimelapse } = React.useMemo(() => {
    if (!media?.length) {
      return { imageFrames: [], videoItems: [], hasTimelapse: false };
    }

    const images = media.filter((m) => m.mime_type.startsWith('image/'));
    const videos = media.filter((m) => m.mime_type.startsWith('video/'));
    const timelapse =
      images.length > 1 || images.some((m) => m.relation === 'timelapse');

    return {
      imageFrames: images,
      videoItems: videos,
      hasTimelapse: timelapse,
    };
  }, [media]);

  const timelapseFrameUrls = React.useMemo(
    () => imageFrames.map((m) => `api/media/${m.file_path}`),
    [imageFrames],
  );

  const downloadMediaPath = imageFrames[0]?.file_path ?? media?.[0]?.file_path;

  const handleDelete = () => {
    if (!event) return;
    if (!window.confirm(t('event_details.confirm_delete_event'))) return;
    deleteEventMutation(event.id, {
      onSuccess: () => {
        onClose();
      },
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="event-details-modal-content"
        showCloseButton={!hasAnalysisData}
      >
        {/* Tab buttons + inline close — only when analysis tab exists */}
        {hasAnalysisData && (
          <div className="event-tabs">
            <button
              type="button"
              className={`tab-button ${activeTab === 'media' ? 'active' : ''}`}
              onClick={() => setActiveTab('media')}
            >
              <Image size={16} />
              {t('event_details.media')}
            </button>
            <button
              type="button"
              className={`tab-button ${activeTab === 'analysis' ? 'active' : ''}`}
              onClick={() => setActiveTab('analysis')}
            >
              <Activity size={16} />
              {t('event_details.analysis')}
            </button>
            <DialogClose
              type="button"
              className="event-tab-close"
              aria-label={t('common.close')}
              title={t('common.close')}
            >
              <X size={18} aria-hidden />
            </DialogClose>
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
                <div className="event-media-stack">
                  {imageFrames.length > 0 && hasTimelapse && (
                    <TimelapsePlayer
                      frameUrls={timelapseFrameUrls}
                      alt={t('event_details.event_media_alt')}
                    />
                  )}
                  {imageFrames.length === 1 && !hasTimelapse && (
                    <div className="event-media-static-image">
                      <img
                        src={`api/media/${imageFrames[0].file_path}`}
                        alt={t('event_details.event_media_alt')}
                      />
                    </div>
                  )}
                  {videoItems.map((m) => (
                    <div key={m.id} className="event-media-video">
                      <video controls src={`api/media/${m.file_path}`} />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          {activeTab === 'analysis' && hasLitterboxChartWeights && decodedRawData && (
            <div className="event-details-litterbox-analysis">
              <WeightSignalChart
                weights={decodedRawData.weights}
                periods={segmentPeriods ?? EMPTY_LITTERBOX_SEGMENT_PERIODS}
              />
            </div>
          )}
          {activeTab === 'analysis' && hasWaterChartWeights && decodedWaterData && (
            <WaterSignalChart
              weights={decodedWaterData.weights}
              periods={waterPeriods}
            />
          )}
        </div>

        <div className="event-details-body">
          <div className="event-header-row">
            <div className="event-info">
              <DialogTitle className="event-title">
                {getEventTitle(displayEvent, t)}
              </DialogTitle>
              <span className="event-time">
                {formatEventTime(displayEvent.timestamp)}
              </span>
            </div>
            <div className="event-actions">
              {hasLitterboxChartWeights && (
                <>
                  {/* TODO: Hide for devices with visit annotation off — needs device context on the event (or similar) without an extra device fetch. */}
                  <Button
                    type="button"
                    variant="ghost"
                    icon
                    className="action-btn"
                    title={t('event_details.analyze')}
                    aria-label={t('event_details.analyze')}
                    onClick={() => runAnalyze(displayEvent.id)}
                    disabled={isAnalyzing}
                  >
                    {isAnalyzing ? (
                      <Loader2 size={20} aria-hidden className="animate-spin" />
                    ) : (
                      <Sparkles size={20} aria-hidden />
                    )}
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                icon
                className="action-btn"
                title={t('event_details.delete_event')}
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <Trash2 size={20} />
                )}
              </Button>
              {hasMedia && downloadMediaPath && (
                <Button
                  variant="ghost"
                  icon
                  className="action-btn"
                  title={t('event_details.download_media')}
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = `api/media/${downloadMediaPath}`;
                    link.download =
                      downloadMediaPath.split('/').pop() || 'media';
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

          {displayEvent.data?.type === 'litterbox_use' && (
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
                <label className="straining-control" htmlFor="event-details-straining">
                  <span>{t('annotation.straining')}</span>
                  <input
                    id="event-details-straining"
                    type="checkbox"
                    checked={selectedStraining}
                    onChange={handleStrainingChange}
                    className="straining-checkbox"
                    disabled={isUpdating}
                  />
                </label>
              </div>
            </div>
          )}

          <div className="event-section details-section">
            <EventDetailsRenderer event={displayEvent} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EventDetailsModal;
