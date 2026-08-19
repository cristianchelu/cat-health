import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getEventById } from '@/api/pets';
import { reidentifyLitterboxVisits } from '@/api/devices';
import { usePets } from '@/hooks/queries/petQueries';
import {
  useAnalyzeLitterboxEvent,
  useEventMedia,
  useUpdateEvent,
  useDeleteEvent,
  invalidateQueriesAfterEventPatch,
} from '@/hooks/queries/eventQueries';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import {
  FormActions,
  FormInlineDiscard,
  FormShell,
  Select,
} from '@/components/ui/form';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useDraftForm } from '@/hooks/form';
import {
  attributionFromEvent,
  attributionFromSelectValue,
  attributionToPatch,
  attributionSelectOptions,
  attributionSelectValue,
  causeLabelKey,
} from '@/lib/eventAttribution';
import {
  deriveLitterboxSampleRateHz,
  parseLitterboxUseEliminationType,
  type EventDataDTO,
  type GetEventDTO,
  type LitterboxAnalysisStatePeriod,
  type LitterboxUseEliminationType,
} from 'shared';
import WeightSignalChart from './WeightSignalChart';
import WaterSignalChart from './WaterSignalChart';
import TimelapsePlayer from './TimelapsePlayer';
import { buildTimelapseTimeline } from './buildTimelapseTimeline';
import { decodeLitterboxRawData } from './decodeLitterboxRawData';
import { decodeWaterRawData } from './decodeWaterRawData';
import { analyzeWaterSegments } from './analyzeWaterSegments';
import LitterboxWeightBlock from './LitterboxWeightBlock';
import { useFormatters } from '@/contexts/RegionalPreferencesProvider';
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

/** Event variants that carry a duration (seconds). */
function getEventDurationSeconds(data: EventDataDTO): number | undefined {
  switch (data.type) {
    case 'water_intake':
    case 'litterbox_use':
      return data.duration;
    default:
      return undefined;
  }
}

interface EventDetailsModalProps {
  event: GetEventDTO | null;
  isOpen: boolean;
  onClose: () => void;
}

const WaterIntakeDetails: React.FC<{ event: GetEventDTO }> = ({ event }) => {
  const { t } = useTranslation();
  if (event.data.type !== 'water_intake') return null;
  const data = event.data;
  const hasFiltering = data.excluded_amount != null && data.excluded_amount > 0;
  return (
    <div className="event-specific-details">
      {data.duration != null && (
        <span className="detail-item">
          <Timer className="detail-item-icon" aria-hidden />
          <span className="detail-item-label">
            {t('event_details.duration_label')}
          </span>
          <span className="detail-item-value">
            {t('event_details.duration_value', { seconds: data.duration })}
          </span>
        </span>
      )}
      {data.amount != null && (
        <span className="detail-item">
          <GlassWater className="detail-item-icon" aria-hidden />
          <span className="detail-item-label">
            {t('event_details.amount_label')}
          </span>
          <span className="detail-item-value">
            {t('event_details.amount_value', { amount: data.amount })}
          </span>
        </span>
      )}
      {hasFiltering && (
        <span className="detail-item">
          <DropletOff className="detail-item-icon" aria-hidden />
          <span className="detail-item-label">
            {t('event_details.water_spilled_label')}
          </span>
          <span className="detail-item-value">
            {t('event_details.water_spilled_amount', {
              amount: data.excluded_amount,
            })}
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
      return (
        <p className="text-muted">{t('event_details.no_additional_details')}</p>
      );
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
    case 'device_connectivity':
      return t('event_details.device_connectivity');
    case 'pet_presence':
      return t('event_details.pet_presence');
    default:
      return t('event_details.event_detected');
  }
}

const EventDetailsModal: React.FC<EventDetailsModalProps> = ({
  event,
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation();
  const { formatDateTime } = useFormatters();
  const queryClient = useQueryClient();
  const { data: pets } = usePets();

  const eliminationTypeOptions: {
    value: LitterboxUseEliminationType;
    label: string;
  }[] = [
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
  const {
    mutate: updateEvent,
    isPending: isUpdating,
    error: updateError,
  } = useUpdateEvent();
  const { mutate: deleteEventMutation, isPending: isDeleting } =
    useDeleteEvent();
  const { mutate: runAnalyze, isPending: isAnalyzing } =
    useAnalyzeLitterboxEvent();

  const eventId = event?.id;
  const { data: eventFromServer } = useQuery({
    queryKey: ['event', eventId ?? 0],
    queryFn: () => getEventById(eventId!),
    enabled: Boolean(isOpen && eventId),
  });

  const [activeTab, setActiveTab] = React.useState<'media' | 'analysis'>(
    'media',
  );
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [reidentifyOnDelete, setReidentifyOnDelete] = React.useState(false);

  /** Prefer React Query payload so the modal stays in sync after mutations (e.g. reanalyze) while `event` from parent state may be stale. */
  const displayEvent = event ? (eventFromServer ?? event) : null;
  const draftBaseline = React.useMemo(
    () => ({
      pet: displayEvent
        ? attributionFromEvent(displayEvent)
        : { petId: null, causedBy: 'unknown' as const },
      eliminationType:
        displayEvent?.data?.type === 'litterbox_use'
          ? (displayEvent.data.elimination_type ?? 'unknown')
          : 'unknown',
      straining:
        displayEvent?.data?.type === 'litterbox_use'
          ? (displayEvent.data.straining ?? false)
          : false,
    }),
    [displayEvent],
  );
  const draftBaselineKey = `${displayEvent?.id ?? 'new'}|${attributionSelectValue(draftBaseline.pet)}|${draftBaseline.eliminationType}|${draftBaseline.straining}`;
  const { draft, patchDraft, isDirty, requestDiscard, discardConfirm } =
    useDraftForm(draftBaseline, { baselineKey: draftBaselineKey });

  const decodedRawData = React.useMemo(() => {
    if (displayEvent?.data?.type !== 'litterbox_use') return null;
    return decodeLitterboxRawData(displayEvent.raw_data);
  }, [displayEvent]);

  const decodedWaterData = React.useMemo(() => {
    if (displayEvent?.data?.type !== 'water_intake') return null;
    return decodeWaterRawData(displayEvent.raw_data);
  }, [displayEvent]);

  // Check if event has analysis data
  const hasAnalysisData =
    (displayEvent?.data?.type === 'litterbox_use' &&
      (decodedRawData?.weights?.length ?? 0) > 0) ||
    (displayEvent?.data?.type === 'water_intake' &&
      (decodedWaterData?.weights?.length ?? 0) > 0);

  const litterboxData =
    displayEvent?.data?.type === 'litterbox_use'
      ? displayEvent.data
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
    setActiveTab('media');
    setShowDeleteConfirm(false);
    setReidentifyOnDelete(false);
  }, [event?.id]);

  const hasMedia = Boolean(media?.length);

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

  const timelapseTimeline = React.useMemo(() => {
    const eventDurationSec = displayEvent
      ? getEventDurationSeconds(displayEvent.data)
      : undefined;
    return buildTimelapseTimeline(imageFrames, eventDurationSec);
  }, [displayEvent, imageFrames]);

  const downloadMediaPath = imageFrames[0]?.file_path ?? media?.[0]?.file_path;

  if (!event || !displayEvent) {
    return null;
  }

  const handlePetChange = (e: React.ChangeEvent<HTMLSelectElement>) =>
    patchDraft({ pet: attributionFromSelectValue(e.target.value) });

  const handleEliminationTypeChange = (
    e: React.ChangeEvent<HTMLSelectElement>,
  ) => {
    const parsed = parseLitterboxUseEliminationType(e.target.value);
    if (!parsed) return;
    patchDraft({
      eliminationType: parsed,
    });
  };

  const handleStrainingChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    patchDraft({ straining: e.target.checked });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isDirty) return;
    const litterboxData =
      displayEvent.data.type === 'litterbox_use'
        ? {
            ...displayEvent.data,
            elimination_type: draft.eliminationType,
            straining: draft.straining,
            ...(draft.eliminationType !==
              (displayEvent.data.elimination_type ?? 'unknown') && {
              segments: null,
            }),
          }
        : undefined;

    updateEvent({
      eventId: displayEvent.id,
      data: {
        ...attributionToPatch(draft.pet),
        ...(litterboxData && { data: litterboxData }),
        human_verified: true,
      },
    });
  };

  const petOptions = attributionSelectOptions(pets, {
    unknown: t('common.unknown'),
    cause: (cause) => t(causeLabelKey(cause)),
  });

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
    setReidentifyOnDelete(false);
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
    setReidentifyOnDelete(false);
  };

  const handleDeleteConfirm = async () => {
    if (!displayEvent) return;
    const deviceId = displayEvent.device_id;
    const after = displayEvent.timestamp;

    deleteEventMutation(displayEvent.id, {
      onSuccess: async () => {
        if (reidentifyOnDelete && deviceId != null) {
          await reidentifyLitterboxVisits(deviceId, after);
          invalidateQueriesAfterEventPatch(queryClient);
          await queryClient.invalidateQueries({
            queryKey: ['litterboxTrends'],
          });
        }
        onClose();
      },
    });
  };

  const handleClose = () => requestDiscard(onClose);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
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
                    {timelapseTimeline && (
                      <TimelapsePlayer
                        frames={timelapseTimeline.frames}
                        durationSec={timelapseTimeline.durationSec}
                        intervalSec={timelapseTimeline.intervalSec}
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
            {activeTab === 'analysis' &&
              hasLitterboxChartWeights &&
              decodedRawData && (
                <div className="event-details-litterbox-analysis">
                  <WeightSignalChart
                    weights={decodedRawData.weights}
                    sampleRate={deriveLitterboxSampleRateHz(
                      decodedRawData,
                      litterboxData?.duration,
                    )}
                    periods={segmentPeriods ?? EMPTY_LITTERBOX_SEGMENT_PERIODS}
                  />
                </div>
              )}
            {activeTab === 'analysis' &&
              hasWaterChartWeights &&
              decodedWaterData && (
                <WaterSignalChart
                  weights={decodedWaterData.weights}
                  periods={waterPeriods}
                />
              )}
          </div>

          <FormShell
            className="event-details-body"
            onSubmit={handleSave}
            error={updateError instanceof Error ? updateError.message : null}
            actionsSlot={
              discardConfirm.open ? (
                <FormInlineDiscard
                  keepLabel={t('common.keep_editing')}
                  discardLabel={t('common.discard')}
                  onKeepEditing={discardConfirm.onCancel}
                  onDiscard={discardConfirm.onConfirm}
                  disabled={isUpdating}
                />
              ) : (
                <FormActions
                  onCancel={handleClose}
                  cancelLabel={t('common.cancel')}
                  submitLabel={t('common.save')}
                  isSubmitting={isUpdating}
                  submitDisabled={!isDirty}
                />
              )
            }
          >
            <div className="event-header-row">
              <div className="event-info">
                <DialogTitle className="event-title">
                  {getEventTitle(displayEvent, t)}
                </DialogTitle>
                <span className="event-time">
                  {displayEvent.timestamp
                    ? formatDateTime(new Date(displayEvent.timestamp))
                    : ''}
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
                        <Loader2
                          size={20}
                          aria-hidden
                          className="animate-spin"
                        />
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
                  onClick={handleDeleteClick}
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
                  value={attributionSelectValue(draft.pet)}
                  onChange={handlePetChange}
                  className="pet-select"
                  disabled={isUpdating}
                />
              </div>
            </div>

            {displayEvent.data?.type === 'litterbox_use' && (
              <LitterboxWeightBlock parentEvent={displayEvent} />
            )}

            {displayEvent.data?.type === 'litterbox_use' && (
              <div className="event-section elimination-type-section">
                <div className="section-label">
                  <Info size={14} className="info-icon" />
                  <span>{t('event_details.event_type')}</span>
                </div>
                <div className="elimination-type-selector-wrapper">
                  <Select
                    options={eliminationTypeOptions}
                    value={draft.eliminationType}
                    onChange={handleEliminationTypeChange}
                    className="elimination-type-select"
                    disabled={isUpdating}
                  />
                  <label
                    className="straining-control"
                    htmlFor="event-details-straining"
                  >
                    <span>{t('annotation.straining')}</span>
                    <input
                      id="event-details-straining"
                      type="checkbox"
                      checked={draft.straining}
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
          </FormShell>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={showDeleteConfirm}
        title={t('event_details.delete_visit')}
        description={t('event_details.confirm_delete_visit')}
        confirmLabel={t('event_details.delete_visit')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        isConfirming={isDeleting}
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={handleDeleteCancel}
      >
        <label className="event-delete-checkbox">
          <input
            type="checkbox"
            checked={reidentifyOnDelete}
            onChange={(e) => setReidentifyOnDelete(e.target.checked)}
            disabled={isDeleting || displayEvent.device_id == null}
          />
          <span>{t('event_details.reidentify_later_visits')}</span>
        </label>
      </ConfirmDialog>
    </>
  );
};

export default EventDetailsModal;
