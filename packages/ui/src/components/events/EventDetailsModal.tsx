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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { FallbackImage } from '@/components/ui/FallbackImage';
import {
  Checkbox,
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
  type GetEventListItemDTO,
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
import {
  Loader2,
  Trash2,
  Download,
  Info,
  Image,
  ImageOff,
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
  /** Usually a list row — no `raw_data`; the modal fetches the full event by id for signal decoding. */
  event: GetEventListItemDTO | null;
  isOpen: boolean;
  onClose: () => void;
}

/** One measured fact: an icon, what it is, and what it read. */
const Fact: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
}> = ({ icon, label, value }) => (
  <span className="event-details-fact">
    {icon}
    <span className="event-details-fact-label">{label}</span>
    <span className="event-details-fact-value">{value}</span>
  </span>
);

const WaterIntakeDetails: React.FC<{ event: GetEventListItemDTO }> = ({
  event,
}) => {
  const { t } = useTranslation();
  if (event.data.type !== 'water_intake') return null;
  const data = event.data;
  const hasFiltering = data.excluded_amount != null && data.excluded_amount > 0;
  return (
    <div className="event-details-facts">
      {data.duration != null && (
        <Fact
          icon={<Timer aria-hidden />}
          label={t('event_details.duration_label')}
          value={t('event_details.duration_value', { seconds: data.duration })}
        />
      )}
      {data.amount != null && (
        <Fact
          icon={<GlassWater aria-hidden />}
          label={t('event_details.amount_label')}
          value={t('event_details.amount_value', { amount: data.amount })}
        />
      )}
      {hasFiltering && (
        <Fact
          icon={<DropletOff aria-hidden />}
          label={t('event_details.water_spilled_label')}
          value={t('event_details.water_spilled_amount', {
            amount: data.excluded_amount,
          })}
        />
      )}
    </div>
  );
};

const EventDetailsRenderer: React.FC<{ event: GetEventListItemDTO }> = ({
  event,
}) => {
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

function getEventTitle(
  event: GetEventListItemDTO,
  t: (key: string) => string,
): string {
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

  /** `event` is a list row without `raw_data`; only the detail fetch carries the signal. */
  const decodedRawData = React.useMemo(() => {
    if (displayEvent?.data?.type !== 'litterbox_use') return null;
    return decodeLitterboxRawData(eventFromServer?.raw_data);
  }, [displayEvent, eventFromServer]);

  const decodedWaterData = React.useMemo(() => {
    if (displayEvent?.data?.type !== 'water_intake') return null;
    return decodeWaterRawData(eventFromServer?.raw_data);
  }, [displayEvent, eventFromServer]);

  // Check if event has analysis data
  const hasAnalysisData =
    (displayEvent?.data?.type === 'litterbox_use' &&
      (decodedRawData?.weights?.length ?? 0) > 0) ||
    (displayEvent?.data?.type === 'water_intake' &&
      (decodedWaterData?.weights?.length ?? 0) > 0);

  const litterboxData =
    displayEvent?.data?.type === 'litterbox_use' ? displayEvent.data : null;

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
          className="event-details-modal"
          showCloseButton={!hasAnalysisData}
        >
          <Tabs
            variant="bar"
            value={activeTab}
            onValueChange={(value) =>
              setActiveTab(value as 'media' | 'analysis')
            }
          >
            {/* The strip exists only when there is a second panel to reach.
                Without it the dialog keeps its own floating close. */}
            {hasAnalysisData && (
              <TabsList>
                <TabsTrigger value="media">
                  <Image size={16} aria-hidden />
                  {t('event_details.media')}
                </TabsTrigger>
                <TabsTrigger value="analysis">
                  <Activity size={16} aria-hidden />
                  {t('event_details.analysis')}
                </TabsTrigger>
                {/* Square, flush with the strip — the dialog's floating close
                    would sit on top of the tabs. */}
                <DialogClose
                  type="button"
                  className="event-details-tab-close"
                  aria-label={t('common.close')}
                  title={t('common.close')}
                >
                  <X size={18} aria-hidden />
                </DialogClose>
              </TabsList>
            )}

            <TabsContent value="media" className="event-details-stage">
              {isLoadingMedia && (
                <div className="event-details-stage-note">
                  <Loader2 className="animate-spin" aria-hidden />
                </div>
              )}
              {!isLoadingMedia && !hasMedia && (
                <div className="event-details-stage-note">
                  <p>{t('event_details.no_media_available')}</p>
                </div>
              )}
              {!isLoadingMedia && hasMedia && (
                <div className="event-details-media-stack">
                  {timelapseTimeline && (
                    <TimelapsePlayer
                      frames={timelapseTimeline.frames}
                      durationSec={timelapseTimeline.durationSec}
                      intervalSec={timelapseTimeline.intervalSec}
                      alt={t('event_details.event_media_alt')}
                    />
                  )}
                  {imageFrames.length === 1 && !hasTimelapse && (
                    <div className="event-details-media-still">
                      <FallbackImage
                        src={`api/media/${imageFrames[0].file_path}`}
                        alt={t('event_details.event_media_alt')}
                        fit="contain"
                        fallback={<ImageOff size={24} aria-hidden="true" />}
                      />
                    </div>
                  )}
                  {videoItems.map((m) => (
                    <div key={m.id} className="event-details-media-video">
                      <video controls src={`api/media/${m.file_path}`} />
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="analysis" className="event-details-stage">
              {hasLitterboxChartWeights && decodedRawData && (
                <div className="event-details-chart">
                  <WeightSignalChart
                    className="event-details-chart-signal"
                    weights={decodedRawData.weights}
                    sampleRate={deriveLitterboxSampleRateHz(
                      decodedRawData,
                      litterboxData?.duration,
                    )}
                    periods={segmentPeriods ?? EMPTY_LITTERBOX_SEGMENT_PERIODS}
                  />
                </div>
              )}
              {hasWaterChartWeights && decodedWaterData && (
                <WaterSignalChart
                  weights={decodedWaterData.weights}
                  periods={waterPeriods}
                />
              )}
            </TabsContent>
          </Tabs>

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
            <div className="event-details-header">
              <div className="event-details-identity">
                <DialogTitle className="event-details-title">
                  {getEventTitle(displayEvent, t)}
                </DialogTitle>
                <span className="event-details-time">
                  {displayEvent.timestamp
                    ? formatDateTime(new Date(displayEvent.timestamp))
                    : ''}
                </span>
              </div>
              <div className="event-details-actions">
                {hasLitterboxChartWeights && (
                  <>
                    {/* TODO: Hide for devices with visit annotation off — needs device context on the event (or similar) without an extra device fetch. */}
                    <Button
                      type="button"
                      variant="ghost"
                      icon
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

            <div className="event-details-section">
              <div className="event-details-section-label">
                <Info size={14} aria-hidden />
                <span>{t('event_details.pet_identification')}</span>
              </div>
              <div className="event-details-control">
                <Select
                  options={petOptions}
                  value={attributionSelectValue(draft.pet)}
                  onChange={handlePetChange}
                  className="event-details-select"
                  disabled={isUpdating}
                />
              </div>
            </div>

            {displayEvent.data?.type === 'litterbox_use' && (
              <LitterboxWeightBlock parentEvent={displayEvent} />
            )}

            {displayEvent.data?.type === 'litterbox_use' && (
              <div className="event-details-section">
                <div className="event-details-section-label">
                  <Info size={14} aria-hidden />
                  <span>{t('event_details.event_type')}</span>
                </div>
                <div className="event-details-control">
                  <Select
                    options={eliminationTypeOptions}
                    value={draft.eliminationType}
                    onChange={handleEliminationTypeChange}
                    className="event-details-select"
                    disabled={isUpdating}
                  />
                  <label
                    className={cn(
                      'event-details-straining',
                      isUpdating && 'is-disabled',
                    )}
                    htmlFor="event-details-straining"
                  >
                    <span>{t('annotation.straining')}</span>
                    <Checkbox
                      id="event-details-straining"
                      checked={draft.straining}
                      onChange={handleStrainingChange}
                      disabled={isUpdating}
                    />
                  </label>
                </div>
              </div>
            )}

            <div className="event-details-extra">
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
        <Checkbox
          checked={reidentifyOnDelete}
          onCheckedChange={setReidentifyOnDelete}
          disabled={isDeleting || displayEvent.device_id == null}
          label={t('event_details.reidentify_later_visits')}
        />
      </ConfirmDialog>
    </>
  );
};

export default EventDetailsModal;
