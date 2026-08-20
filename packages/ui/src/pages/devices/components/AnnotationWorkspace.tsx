import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCheck,
  AlertCircle,
  Trash2,
  Loader2,
  RotateCcw,
  Ban,
  Wrench,
  Video,
  Sparkles,
} from 'lucide-react';
import { getEventById } from '@/api/pets';
import {
  useAnalyzeLitterboxEvent,
  useEventMedia,
  usePatchEvent,
} from '@/hooks/queries/eventQueries';
import { usePets } from '@/hooks/queries/petQueries';
import { Select } from '@/components/ui/form/Select';
import { Button } from '@/components/ui/Button';
import { FormActions, FormError } from '@/components/ui/form';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DiscardUnsavedDialog } from '@/components/ui/DiscardUnsavedDialog';
import WeightSignalChart from '@/components/events/WeightSignalChart';
import LitterboxWeightBlock from '@/components/events/LitterboxWeightBlock';
import { decodeLitterboxRawData } from '@/components/events/decodeLitterboxRawData';
import { deriveDetectorBouts } from '@/lib/litterboxDetectorBouts';
import {
  attributionFromEvent,
  attributionFromSelectValue,
  attributionToPatch,
  attributionSelectOptions,
  attributionSelectValue,
  causeLabelKey,
} from '@/lib/eventAttribution';
import type {
  GetEventListItemDTO,
  LitterboxAnalysisStatePeriod,
  LitterboxUseEliminationType,
  LitterboxUseEventDataDTO,
} from 'shared';
import {
  deriveLitterboxSampleRateHz,
  parseLitterboxUseEliminationType,
} from 'shared';
import type { LitterboxBoutAnnotation } from '@/types/litterbox';
import './AnnotationWorkspace.css';

/** Stable fallback so `periods` stays referentially equal when there are no analyzer segments. */
const EMPTY_ANALYSIS_PERIODS: LitterboxAnalysisStatePeriod[] = [];

interface AnnotationWorkspaceProps {
  /** List row — carries no `raw_data`; the signal is fetched via GET /events/:id below. */
  event: GetEventListItemDTO;
  /** From URL (`video=1`); panel visibility for media strip. */
  videoOpen: boolean;
  onVideoOpenChange: (open: boolean) => void;
  /** Fires when draft dirty state changes (visit switch / route leave guards). */
  onDirtyChange?: (dirty: boolean) => void;
  actionsRef?: React.MutableRefObject<AnnotationWorkspaceActions | null>;
  onConvertedToMaintenance?: () => void;
}

const BOUT_TYPES: LitterboxBoutAnnotation['bout_type'][] = [
  'urination',
  'defecation',
  'unknown',
];

const ELIMINATION_TYPES: {
  value: LitterboxUseEliminationType;
  label: string;
}[] = [
  { value: 'urination', label: 'overview.urination' },
  { value: 'defecation', label: 'overview.defecation' },
  { value: 'both', label: 'overview.both' },
  { value: 'no_elimination', label: 'overview.no_elimination' },
  { value: 'unknown', label: 'common.unknown' },
];

function getLitterboxData(
  event: GetEventListItemDTO,
): LitterboxUseEventDataDTO | null {
  return event.data.type === 'litterbox_use' ? event.data : null;
}

function getBouts(event: GetEventListItemDTO): LitterboxBoutAnnotation[] {
  return getLitterboxData(event)?.annotation?.bouts ?? [];
}

function hasPersistedBouts(event: GetEventListItemDTO): boolean {
  const annotation = getLitterboxData(event)?.annotation;
  return (
    annotation != null &&
    Object.prototype.hasOwnProperty.call(annotation, 'bouts')
  );
}

function boutsEqual(
  a: LitterboxBoutAnnotation[],
  b: LitterboxBoutAnnotation[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const left = a[i];
    const right = b[i];
    if (
      left.t_start_s !== right.t_start_s ||
      left.t_end_s !== right.t_end_s ||
      left.bout_type !== right.bout_type
    ) {
      return false;
    }
  }
  return true;
}

export interface AnnotationWorkspaceActions {
  toggleVideo: () => void;
  toggleStraining: () => void;
  /** Immediately persists (not part of the draft flow — see AnnotationWorkspace module docs). */
  toggleVerified: () => Promise<void>;
  toggleExcluded: () => void;
  /** Immediately persists (not part of the draft flow — see AnnotationWorkspace module docs). */
  setVerified: (next: boolean) => Promise<void>;
  deleteSelectedBout: () => void;
  selectAdjacentBout: (direction: -1 | 1) => void;
  clearAllBouts: () => void;
  resetToDetector: () => void;
  setSelectedBoutType: (boutType: LitterboxBoutAnnotation['bout_type']) => void;
  clearSelection: () => void;
  convertToMaintenance: () => void;
  reanalyze: () => void;
  setEventEliminationType: (t: LitterboxUseEliminationType) => void;
}

const AnnotationWorkspace: React.FC<AnnotationWorkspaceProps> = (props) => {
  const litterboxData = getLitterboxData(props.event);
  if (!litterboxData) {
    return (
      <div className="annotation-workspace">
        <FormError message="Invalid litterbox event data" />
      </div>
    );
  }
  return <AnnotationWorkspaceBody {...props} litterboxData={litterboxData} />;
};

interface AnnotationWorkspaceBodyProps extends AnnotationWorkspaceProps {
  litterboxData: LitterboxUseEventDataDTO;
}

const AnnotationWorkspaceBody: React.FC<AnnotationWorkspaceBodyProps> = ({
  event,
  litterboxData,
  videoOpen,
  onVideoOpenChange,
  onDirtyChange,
  actionsRef,
  onConvertedToMaintenance,
}) => {
  const { t } = useTranslation();
  /** Avoid `useMutation` here: it re-renders via useSyncExternalStore on every mutation state tick. */
  const { patchEvent, isPatching: isSaving } = usePatchEvent();
  const { mutateAsync: runAnalyzeAsync, isPending: isAnalyzing } =
    useAnalyzeLitterboxEvent();
  const { data: pets } = usePets();
  const { data: media, isLoading: isLoadingMedia } = useEventMedia(event.id);
  /** List rows carry no `raw_data`; the signal (and children) comes from the detail fetch. */
  const { data: eventDetail, isPending: isDetailPending } = useQuery({
    queryKey: ['event', event.id],
    queryFn: () => getEventById(event.id),
  });
  const eventWithChildren = eventDetail ?? { ...event, children: [] };

  const segmentsFromServer = litterboxData.segments;

  const decodedRaw = React.useMemo(
    () => decodeLitterboxRawData(eventDetail?.raw_data),
    [eventDetail?.raw_data],
  );
  const weights = React.useMemo(() => decodedRaw?.weights ?? [], [decodedRaw]);

  const analysisResult = React.useMemo(() => {
    if (segmentsFromServer == null) return null;
    return { periods: segmentsFromServer };
  }, [segmentsFromServer]);

  const sampleRate = React.useMemo(
    () => deriveLitterboxSampleRateHz(decodedRaw, litterboxData.duration),
    [decodedRaw, litterboxData.duration],
  );

  const detectorBouts = React.useMemo(() => {
    if (!analysisResult) return [];
    return deriveDetectorBouts(analysisResult.periods, sampleRate);
  }, [analysisResult, sampleRate]);

  const serverDraftBaseline = React.useMemo(
    () => ({
      petId: attributionSelectValue(attributionFromEvent(event)),
      eliminationType: litterboxData.elimination_type ?? 'unknown',
      straining: litterboxData.straining ?? false,
      excluded: litterboxData.annotation?.excluded ?? false,
      bouts: hasPersistedBouts(event) ? getBouts(event) : detectorBouts,
    }),
    [event, litterboxData, detectorBouts],
  );
  const [draftBaseline, setDraftBaseline] = React.useState(serverDraftBaseline);
  const latestServerBaselineRef = React.useRef(serverDraftBaseline);
  const [localBouts, setLocalBouts] = React.useState<LitterboxBoutAnnotation[]>(
    serverDraftBaseline.bouts,
  );
  const [selectedBoutIndex, setSelectedBoutIndex] = React.useState<
    number | null
  >(null);
  const [petId, setPetId] = React.useState<string>(serverDraftBaseline.petId);
  const [eliminationType, setEliminationType] =
    React.useState<LitterboxUseEliminationType>(
      serverDraftBaseline.eliminationType,
    );
  const [straining, setStraining] = React.useState<boolean>(
    serverDraftBaseline.straining,
  );
  const [excluded, setExcluded] = React.useState<boolean>(
    serverDraftBaseline.excluded,
  );

  /** Latest server event snapshot; avoids re-creating `flushSave` when `event.data` identity changes (refetch / mutation). */
  const eventIdRef = React.useRef(event.id);
  const eventDataRef = React.useRef<LitterboxUseEventDataDTO>(litterboxData);

  React.useEffect(() => {
    eventIdRef.current = event.id;
    eventDataRef.current = litterboxData;
  });

  const isDirty = React.useMemo(
    () =>
      petId !== draftBaseline.petId ||
      eliminationType !== draftBaseline.eliminationType ||
      straining !== draftBaseline.straining ||
      excluded !== draftBaseline.excluded ||
      !boutsEqual(localBouts, draftBaseline.bouts),
    [petId, eliminationType, straining, excluded, localBouts, draftBaseline],
  );
  const isDirtyRef = React.useRef(isDirty);
  const baselineEventIdRef = React.useRef(event.id);

  React.useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  React.useEffect(() => {
    latestServerBaselineRef.current = serverDraftBaseline;
    const eventChanged = baselineEventIdRef.current !== event.id;
    if (!eventChanged && isDirtyRef.current) return;

    baselineEventIdRef.current = event.id;
    setDraftBaseline(serverDraftBaseline);
    setLocalBouts(serverDraftBaseline.bouts);
    setSelectedBoutIndex(null);
    setPetId(serverDraftBaseline.petId);
    setEliminationType(serverDraftBaseline.eliminationType);
    setStraining(serverDraftBaseline.straining);
    setExcluded(serverDraftBaseline.excluded);
  }, [event.id, serverDraftBaseline]);

  React.useEffect(() => {
    onDirtyChange?.(isDirty);
    return () => onDirtyChange?.(false);
  }, [isDirty, onDirtyChange]);

  const resetDraftToBaseline = React.useCallback(() => {
    const baseline = latestServerBaselineRef.current;
    setDraftBaseline(baseline);
    setLocalBouts(baseline.bouts);
    setSelectedBoutIndex(null);
    setPetId(baseline.petId);
    setEliminationType(baseline.eliminationType);
    setStraining(baseline.straining);
    setExcluded(baseline.excluded);
  }, []);

  const [discardOpen, setDiscardOpen] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  const handleCancel = React.useCallback(() => {
    if (!isDirty) {
      resetDraftToBaseline();
      return;
    }
    setDiscardOpen(true);
  }, [isDirty, resetDraftToBaseline]);

  const handleConfirmDiscard = React.useCallback(() => {
    resetDraftToBaseline();
    setDiscardOpen(false);
  }, [resetDraftToBaseline]);

  const handleCancelDiscard = React.useCallback(() => {
    setDiscardOpen(false);
  }, []);

  const flushSave = React.useCallback(
    async (
      nextBouts: LitterboxBoutAnnotation[],
      nextPetId: string,
      nextElimType: LitterboxUseEliminationType,
      nextStraining: boolean,
      humanVerified: boolean,
      nextExcluded: boolean,
    ) => {
      const eventData = eventDataRef.current;
      const eventId = eventIdRef.current;
      const previousEliminationType = eventData.elimination_type;
      await patchEvent({
        eventId,
        data: {
          ...attributionToPatch(attributionFromSelectValue(nextPetId)),
          data: {
            ...eventData,
            elimination_type: nextElimType,
            straining: nextStraining,
            ...(previousEliminationType !== nextElimType && {
              segments: null,
            }),
            annotation: {
              ...(eventData.annotation ?? {}),
              bouts: nextBouts,
              excluded: nextExcluded,
            },
          },
          human_verified: humanVerified,
        },
      });
    },
    [patchEvent],
  );

  const handleSave = React.useCallback(async () => {
    setSaveError(null);
    try {
      await flushSave(
        localBouts,
        petId,
        eliminationType,
        straining,
        event.human_verified,
        excluded,
      );
      setDraftBaseline({
        petId,
        eliminationType,
        straining,
        excluded,
        bouts: localBouts,
      });
      isDirtyRef.current = false;
    } catch {
      setSaveError(t('annotation.save_error'));
    }
  }, [
    flushSave,
    localBouts,
    petId,
    eliminationType,
    straining,
    event.human_verified,
    excluded,
    t,
  ]);

  const handleBoutsChange = React.useCallback(
    (bouts: LitterboxBoutAnnotation[]) => {
      setLocalBouts(bouts);
    },
    [],
  );

  const handlePetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setPetId(e.target.value);
  };

  const handleEliminationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setEliminationType((current) => {
      const parsed = parseLitterboxUseEliminationType(e.target.value);
      return parsed ?? current;
    });
  };

  const setEventEliminationType = React.useCallback(
    (val: LitterboxUseEliminationType) => {
      setEliminationType(val);
    },
    [],
  );

  const handleStrainingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setStraining(e.target.checked);
  };

  const handleToggleVerified = async () => {
    if (isDirty) return;
    const next = !event.human_verified;
    await flushSave(
      localBouts,
      petId,
      eliminationType,
      straining,
      next,
      excluded,
    );
  };

  const handleToggleExcluded = () => {
    setExcluded((prev) => !prev);
  };

  /** Which destructive/commit confirm dialog is pending; only one can be open at a time. */
  const [pendingConfirm, setPendingConfirm] = React.useState<
    'maintenance' | 'clear-bouts' | 'reset-detector' | null
  >(null);

  const handleConvertToMaintenance = React.useCallback(() => {
    setPendingConfirm('maintenance');
  }, []);

  const handleConfirmPending = React.useCallback(async () => {
    if (pendingConfirm === 'maintenance') {
      await patchEvent({
        eventId: event.id,
        data: {
          // Scooping is a person's doing — resolved, not unresolved, so it must
          // not come back in the "needs a human" queue.
          pet_id: null,
          caused_by: 'human',
          data: {
            type: 'litterbox_maintenance',
            maintenance_type: 'scoop',
          },
          human_verified: true,
        },
      });
      setPendingConfirm(null);
      onConvertedToMaintenance?.();
      return;
    }
    if (pendingConfirm === 'clear-bouts') {
      setSelectedBoutIndex(null);
      setLocalBouts([]);
      setPendingConfirm(null);
      return;
    }
    if (pendingConfirm === 'reset-detector') {
      if (analysisResult) {
        const next = deriveDetectorBouts(analysisResult.periods, sampleRate);
        setSelectedBoutIndex(next.length ? 0 : null);
        setLocalBouts(next);
      }
      setPendingConfirm(null);
    }
  }, [
    analysisResult,
    event.id,
    onConvertedToMaintenance,
    patchEvent,
    pendingConfirm,
    sampleRate,
  ]);

  const handleCancelPending = React.useCallback(() => {
    setPendingConfirm(null);
  }, []);

  const handleBoutTypeChange = React.useCallback(
    (idx: number, boutType: LitterboxBoutAnnotation['bout_type']) => {
      const next = localBouts.map((b, i) =>
        i === idx ? { ...b, bout_type: boutType } : b,
      );
      handleBoutsChange(next);
    },
    [handleBoutsChange, localBouts],
  );

  const handleDeleteBout = React.useCallback(
    (idx: number) => {
      const next = localBouts
        .filter((_, i) => i !== idx)
        .map((b, i) => ({ ...b, bout_index: i }));
      if (selectedBoutIndex === idx) setSelectedBoutIndex(null);
      else if (selectedBoutIndex !== null && selectedBoutIndex > idx)
        setSelectedBoutIndex(selectedBoutIndex - 1);
      handleBoutsChange(next);
    },
    [handleBoutsChange, localBouts, selectedBoutIndex],
  );

  const petOptions = attributionSelectOptions(pets, {
    unknown: t('common.unknown'),
    cause: (cause) => t(causeLabelKey(cause)),
  });

  const eliminationOptions = ELIMINATION_TYPES.map(({ value, label }) => ({
    value,
    label: t(label),
  }));

  const hasRawData = weights.length > 0;

  const handleReanalyze = React.useCallback(async () => {
    if (!hasRawData || isDirty || isSaving || isAnalyzing) return;
    const preserveElim = eliminationType;
    const preserveStrain = straining;
    try {
      const updated = await runAnalyzeAsync(event.id);
      if (updated.data.type !== 'litterbox_use') return;
      eventDataRef.current = {
        ...updated.data,
        elimination_type: preserveElim,
        straining: preserveStrain,
      };

      const periods = updated.data.segments ?? [];
      const next =
        periods.length === 0 ? [] : deriveDetectorBouts(periods, sampleRate);
      setSelectedBoutIndex(next.length > 0 ? 0 : null);
      setLocalBouts(next);
      // Bouts derived from re-analysis stay a local draft — the analyze endpoint already
      // persisted the new segments; the derived bouts still need an explicit Save.
    } catch {
      // Request failed (e.g. missing raw_data); list/detail queries still refresh on success path only.
    }
  }, [
    eliminationType,
    event.id,
    hasRawData,
    isDirty,
    isAnalyzing,
    isSaving,
    runAnalyzeAsync,
    sampleRate,
    straining,
  ]);

  const videoItems = React.useMemo(
    () => (media ?? []).filter((m) => m.mime_type.startsWith('video/')),
    [media],
  );
  const hasVideo = videoItems.length > 0;
  const showMediaSection = videoOpen;
  /** No video available — disable only while closed (when open, keep enabled so the panel can be dismissed). */
  const videoToggleDisabled =
    isSaving || (!videoOpen && !isLoadingMedia && !hasVideo);

  const toggleVideo = React.useCallback(() => {
    if (isSaving) return;
    if (!videoOpen && !isLoadingMedia && !hasVideo) return;
    onVideoOpenChange(!videoOpen);
  }, [hasVideo, isLoadingMedia, isSaving, onVideoOpenChange, videoOpen]);

  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const videoTimeRafRef = React.useRef<number | null>(null);
  const [videoDurationSec, setVideoDurationSec] = React.useState<number | null>(
    null,
  );
  const [playheadChartSec, setPlayheadChartSec] = React.useState<number | null>(
    null,
  );

  const chartDurationSec = React.useMemo(() => {
    if (!weights.length) return 0;
    return weights.length / sampleRate;
  }, [weights.length, sampleRate]);

  /**
   * When chart span and file length differ (trim, codec, camera buffer), map linearly
   * so chart 0↔end aligns with video 0↔end without backend offset metadata.
   */
  const mapVideoTimeToChartSec = React.useCallback(
    (videoT: number) => {
      if (chartDurationSec <= 0) return 0;
      const vd = videoDurationSec;
      if (vd != null && vd > 0 && Number.isFinite(vd)) {
        const scaled = (videoT / vd) * chartDurationSec;
        return Math.max(0, Math.min(scaled, chartDurationSec));
      }
      return Math.max(0, Math.min(videoT, chartDurationSec));
    },
    [chartDurationSec, videoDurationSec],
  );

  const mapChartSecToVideoTime = React.useCallback(
    (chartSec: number) => {
      if (chartDurationSec <= 0) return 0;
      const vd = videoDurationSec;
      if (vd != null && vd > 0 && Number.isFinite(vd)) {
        const scaled = (chartSec / chartDurationSec) * vd;
        return Math.max(0, Math.min(scaled, vd));
      }
      return Math.max(0, Math.min(chartSec, chartDurationSec));
    },
    [chartDurationSec, videoDurationSec],
  );

  const syncPlayheadFromVideo = React.useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    setPlayheadChartSec(mapVideoTimeToChartSec(el.currentTime));
  }, [mapVideoTimeToChartSec]);

  const onVideoTimeTick = React.useCallback(() => {
    if (videoTimeRafRef.current != null) return;
    videoTimeRafRef.current = requestAnimationFrame(() => {
      videoTimeRafRef.current = null;
      syncPlayheadFromVideo();
    });
  }, [syncPlayheadFromVideo]);

  React.useEffect(
    () => () => {
      if (videoTimeRafRef.current != null)
        cancelAnimationFrame(videoTimeRafRef.current);
    },
    [],
  );

  React.useEffect(() => {
    setPlayheadChartSec(null);
    setVideoDurationSec(null);
  }, [event.id]);

  React.useEffect(() => {
    if (!showMediaSection || !hasVideo) setPlayheadChartSec(null);
  }, [showMediaSection, hasVideo]);

  const handleAxisSeek = React.useCallback(
    (chartSec: number) => {
      const el = videoRef.current;
      if (!el) return;
      el.currentTime = mapChartSecToVideoTime(chartSec);
      setPlayheadChartSec(mapVideoTimeToChartSec(el.currentTime));
    },
    [mapChartSecToVideoTime, mapVideoTimeToChartSec],
  );

  const chartMediaSync = React.useMemo(() => {
    if (!hasVideo || !showMediaSection || chartDurationSec <= 0)
      return undefined;
    return {
      playheadChartSec,
      onAxisSeek: handleAxisSeek,
    };
  }, [
    chartDurationSec,
    handleAxisSeek,
    hasVideo,
    playheadChartSec,
    showMediaSection,
  ]);

  React.useEffect(() => {
    if (!showMediaSection || !hasVideo) return;
    const el = videoRef.current;
    if (!el) return;
    syncPlayheadFromVideo();
  }, [hasVideo, showMediaSection, syncPlayheadFromVideo, videoDurationSec]);

  React.useEffect(() => {
    if (!actionsRef) return;

    actionsRef.current = {
      toggleVideo,
      toggleStraining: () => setStraining((prev) => !prev),
      toggleVerified: async () => {
        if (isDirty) return;
        await flushSave(
          localBouts,
          petId,
          eliminationType,
          straining,
          !event.human_verified,
          excluded,
        );
      },
      toggleExcluded: () => setExcluded((prev) => !prev),
      setVerified: async (next) => {
        if (isDirty) return;
        await flushSave(
          localBouts,
          petId,
          eliminationType,
          straining,
          next,
          excluded,
        );
      },
      deleteSelectedBout: () => {
        if (selectedBoutIndex == null) return;
        handleDeleteBout(selectedBoutIndex);
      },
      selectAdjacentBout: (direction) => {
        if (!localBouts.length) return;
        const idx =
          selectedBoutIndex ?? (direction === 1 ? -1 : localBouts.length);
        const next = Math.max(
          0,
          Math.min(localBouts.length - 1, idx + direction),
        );
        setSelectedBoutIndex(next);
      },
      clearAllBouts: () => {
        if (localBouts.length === 0) return;
        setPendingConfirm('clear-bouts');
      },
      resetToDetector: () => {
        if (!analysisResult) return;
        if (localBouts.length === 0) {
          const next = deriveDetectorBouts(analysisResult.periods, sampleRate);
          setSelectedBoutIndex(next.length ? 0 : null);
          setLocalBouts(next);
          return;
        }
        setPendingConfirm('reset-detector');
      },
      setSelectedBoutType: (boutType) => {
        if (selectedBoutIndex == null) return;
        handleBoutTypeChange(selectedBoutIndex, boutType);
      },
      clearSelection: () => setSelectedBoutIndex(null),
      convertToMaintenance: handleConvertToMaintenance,
      reanalyze: handleReanalyze,
      setEventEliminationType,
    };

    return () => {
      if (actionsRef.current) actionsRef.current = null;
    };
  }, [
    actionsRef,
    toggleVideo,
    analysisResult,
    eliminationType,
    event.human_verified,
    excluded,
    flushSave,
    isDirty,
    handleBoutTypeChange,
    handleConvertToMaintenance,
    handleReanalyze,
    setEventEliminationType,
    handleDeleteBout,
    localBouts,
    petId,
    sampleRate,
    selectedBoutIndex,
    straining,
  ]);

  return (
    <div className="annotation-workspace">
      {showMediaSection && (
        <div
          className="annotation-workspace-media"
          aria-label={t('event_details.media')}
        >
          {isLoadingMedia && (
            <div className="annotation-media-loading">
              <Loader2
                size={28}
                aria-hidden
                className="annotation-media-spinner"
              />
            </div>
          )}
          {!isLoadingMedia && hasVideo && (
            <div className="annotation-media-gallery">
              {videoItems.map((m, i) => (
                <div key={m.id} className="annotation-media-item">
                  <video
                    ref={i === 0 ? videoRef : undefined}
                    controls
                    src={`api/media/${m.file_path}`}
                    onLoadedMetadata={(e) => {
                      if (i !== 0) return;
                      const el = e.currentTarget;
                      const d = el.duration;
                      setVideoDurationSec(
                        Number.isFinite(d) && d > 0 ? d : null,
                      );
                      const cDur = chartDurationSec;
                      if (cDur <= 0) return;
                      const vd = Number.isFinite(d) && d > 0 ? d : null;
                      if (vd != null) {
                        setPlayheadChartSec(
                          Math.max(
                            0,
                            Math.min((el.currentTime / vd) * cDur, cDur),
                          ),
                        );
                      } else {
                        setPlayheadChartSec(
                          Math.max(0, Math.min(el.currentTime, cDur)),
                        );
                      }
                    }}
                    onTimeUpdate={i === 0 ? onVideoTimeTick : undefined}
                    onSeeked={i === 0 ? syncPlayheadFromVideo : undefined}
                  />
                </div>
              ))}
            </div>
          )}
          {!isLoadingMedia && !hasVideo && (
            <p className="annotation-media-empty">
              {t('annotation.no_event_video')}
            </p>
          )}
        </div>
      )}

      {/* Bout chart edits stay local until Save — no PATCH during drag. */}
      <div className="annotation-workspace-chart">
        {hasRawData ? (
          <WeightSignalChart
            weights={weights}
            periods={analysisResult?.periods ?? EMPTY_ANALYSIS_PERIODS}
            sampleRate={sampleRate}
            bouts={localBouts}
            onBoutsChange={handleBoutsChange}
            selectedBoutIndex={selectedBoutIndex}
            onSelectBout={setSelectedBoutIndex}
            mediaSync={chartMediaSync}
          />
        ) : isDetailPending ? (
          <div className="annotation-no-chart">
            <Loader2 size={24} aria-hidden className="animate-spin" />
          </div>
        ) : (
          <div className="annotation-no-chart">
            <AlertCircle size={24} />
            <span>{t('annotation.no_weight_data')}</span>
          </div>
        )}
      </div>

      <div className="annotation-workspace-controls">
        <div className="annotation-session-controls">
          <div className="annotation-session-main-row">
            <div className="annotation-control-group">
              <label className="annotation-control-label">
                {t('annotation.pet_id_short')}
              </label>
              <Select
                options={petOptions}
                value={petId}
                onChange={handlePetChange}
                className="annotation-select"
                disabled={isSaving}
              />
            </div>
            <div className="annotation-control-group">
              <label className="annotation-control-label">
                {t('annotation.session_type_short')}
              </label>
              <Select
                options={eliminationOptions}
                value={eliminationType}
                onChange={handleEliminationChange}
                className="annotation-select"
                disabled={isSaving}
              />
            </div>
            <div className="annotation-control-group annotation-control-group--straining">
              <label
                className="annotation-control-label"
                htmlFor="annotation-straining"
              >
                {t('annotation.straining')}
              </label>
              <input
                id="annotation-straining"
                type="checkbox"
                checked={straining}
                onChange={handleStrainingChange}
                className="annotation-checkbox"
                disabled={isSaving}
              />
            </div>
            <div className="annotation-session-icon-actions">
              <Button
                type="button"
                variant={videoOpen ? 'primary' : 'secondary'}
                size="sm"
                onClick={toggleVideo}
                disabled={videoToggleDisabled}
                className="annotation-icon-action-btn"
                aria-pressed={videoOpen}
                aria-label={
                  videoOpen
                    ? t('annotation.hide_video')
                    : t('annotation.show_video')
                }
                title={
                  !videoOpen && !isLoadingMedia && !hasVideo && !isSaving
                    ? t('annotation.no_event_video')
                    : videoOpen
                      ? t('annotation.hide_video')
                      : t('annotation.show_video')
                }
              >
                <Video size={16} aria-hidden />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleReanalyze}
                disabled={isDirty || isSaving || isAnalyzing || !hasRawData}
                className="annotation-icon-action-btn"
                aria-label={t('event_details.analyze')}
                title={t('event_details.analyze')}
              >
                {isAnalyzing ? (
                  <Loader2 size={16} aria-hidden className="animate-spin" />
                ) : (
                  <Sparkles size={16} aria-hidden />
                )}
              </Button>
              <Button
                type="button"
                variant={event.human_verified ? 'primary' : 'secondary'}
                size="sm"
                onClick={handleToggleVerified}
                disabled={isDirty || isSaving}
                className="annotation-icon-action-btn"
                aria-label={
                  event.human_verified
                    ? t('annotation.verified')
                    : t('annotation.mark_verified')
                }
                title={
                  event.human_verified
                    ? t('annotation.verified')
                    : t('annotation.mark_verified')
                }
              >
                <CheckCheck size={16} aria-hidden />
              </Button>
              <Button
                type="button"
                variant={excluded ? 'danger' : 'secondary'}
                size="sm"
                onClick={() => void handleToggleExcluded()}
                disabled={isSaving}
                className="annotation-icon-action-btn"
                aria-label={t('annotation.exclude_toggle_aria')}
                title={t('annotation.exclude_toggle_aria')}
              >
                <Ban size={16} aria-hidden />
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={() => void handleConvertToMaintenance()}
                disabled={isSaving}
                className="annotation-icon-action-btn"
                aria-label={t('annotation.mark_as_maintenance_aria')}
                title={t('annotation.mark_as_maintenance_aria')}
              >
                <Wrench size={16} aria-hidden />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void actionsRef?.current?.clearAllBouts()}
                disabled={isSaving}
                className="annotation-icon-action-btn"
                aria-label={t('annotation.clear_bouts')}
                title={t('annotation.clear_bouts')}
              >
                <Trash2 size={16} aria-hidden />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void actionsRef?.current?.resetToDetector()}
                disabled={isSaving || !analysisResult}
                className="annotation-icon-action-btn"
                aria-label={t('annotation.reset_detector_bouts')}
                title={t('annotation.reset_detector_bouts')}
              >
                <RotateCcw size={16} aria-hidden />
              </Button>
            </div>
          </div>
          <LitterboxWeightBlock parentEvent={eventWithChildren} />
          <FormError message={saveError} />
          <FormActions
            className="annotation-form-actions"
            onCancel={handleCancel}
            cancelLabel={t('common.cancel')}
            submitLabel={
              isSaving ? t('settings.saving') : t('settings.save_changes')
            }
            isSubmitting={isSaving}
            submitDisabled={!isDirty}
            submitType="button"
            onSubmitClick={() => {
              void handleSave();
            }}
          />
        </div>

        <div className="annotation-bouts-section">
          <div className="annotation-bouts-header">
            <div
              className="annotation-bouts-keys"
              aria-label={t('annotation.keyboard_hints_aria')}
            >
              <span className="annotation-kbd-hint">
                <kbd className="annotation-kbd">v</kbd> {t('annotation.kbd_v')}
              </span>
              <span className="annotation-kbd-hint-sep" aria-hidden>
                ,
              </span>
              <span className="annotation-kbd-hint">
                <span className="annotation-kbd-cluster">
                  <kbd className="annotation-kbd annotation-kbd--wide">
                    Shift
                  </kbd>
                  <span className="annotation-kbd-join">+</span>
                  <kbd className="annotation-kbd">V</kbd>
                </span>{' '}
                {t('annotation.kbd_shift_v')}
              </span>
              <span className="annotation-kbd-hint-sep" aria-hidden>
                ,
              </span>
              <span className="annotation-kbd-hint">
                <kbd className="annotation-kbd">x</kbd> {t('annotation.kbd_x')}
              </span>
              <span className="annotation-kbd-hint-sep" aria-hidden>
                ,
              </span>
              <span className="annotation-kbd-hint">
                <kbd className="annotation-kbd">s</kbd> {t('annotation.kbd_s')}
              </span>
              <span className="annotation-kbd-hint-sep" aria-hidden>
                ,
              </span>
              <span className="annotation-kbd-hint">
                <kbd className="annotation-kbd">r</kbd> {t('annotation.kbd_r')}
              </span>
              <span className="annotation-kbd-hint-sep" aria-hidden>
                ,
              </span>
              <span className="annotation-kbd-hint">
                <span className="annotation-kbd-cluster">
                  <kbd className="annotation-kbd annotation-kbd--wide">
                    Shift
                  </kbd>
                  <span className="annotation-kbd-join">+</span>
                  <kbd className="annotation-kbd">M</kbd>
                </span>{' '}
                {t('annotation.kbd_shift_m')}
              </span>
              <span className="annotation-kbd-hint-sep" aria-hidden>
                ,
              </span>
              <span className="annotation-kbd-hint">
                <kbd className="annotation-kbd">g</kbd> {t('annotation.kbd_g')}
              </span>
              <span className="annotation-kbd-hint-sep" aria-hidden>
                ,
              </span>
              <span className="annotation-kbd-hint">
                <span className="annotation-kbd-cluster">
                  <kbd className="annotation-kbd">n</kbd>
                  <span className="annotation-kbd-join">/</span>
                  <kbd className="annotation-kbd">p</kbd>
                </span>{' '}
                {t('annotation.kbd_np')}
              </span>
              <span className="annotation-kbd-hint-sep" aria-hidden>
                ,
              </span>
              <span className="annotation-kbd-hint">
                <span className="annotation-kbd-cluster">
                  <kbd className="annotation-kbd">1</kbd>
                  <span className="annotation-kbd-join">/</span>
                  <kbd className="annotation-kbd">2</kbd>
                  <span className="annotation-kbd-join">/</span>
                  <kbd className="annotation-kbd">3</kbd>
                </span>{' '}
                {t('annotation.kbd_123')}
              </span>
              <span className="annotation-kbd-hint-sep" aria-hidden>
                ,
              </span>
              <span className="annotation-kbd-hint">
                <span className="annotation-kbd-cluster">
                  <kbd className="annotation-kbd annotation-kbd--wide">Alt</kbd>
                  <span className="annotation-kbd-join">+</span>
                  <kbd className="annotation-kbd">1–5</kbd>
                </span>{' '}
                {t('annotation.kbd_main_elim')}
              </span>
              <span className="annotation-kbd-hint-sep" aria-hidden>
                ,
              </span>
              <span className="annotation-kbd-hint">
                <span className="annotation-kbd-cluster">
                  <kbd className="annotation-kbd annotation-kbd--narrow">[</kbd>
                  <kbd className="annotation-kbd annotation-kbd--narrow">]</kbd>
                </span>{' '}
                {t('annotation.kbd_brackets')}
              </span>
              <span className="annotation-kbd-hint-sep" aria-hidden>
                ,
              </span>
              <span className="annotation-kbd-hint">
                <kbd className="annotation-kbd annotation-kbd--wide">Del</kbd>{' '}
                {t('annotation.kbd_del')}
              </span>
            </div>
          </div>

          {localBouts.length === 0 ? (
            <p className="annotation-bouts-empty">{t('annotation.no_bouts')}</p>
          ) : (
            <table className="annotation-bouts-table">
              <thead>
                <tr>
                  <th>{t('annotation.bout_start')}</th>
                  <th>{t('annotation.bout_end')}</th>
                  <th>{t('annotation.bout_type')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {localBouts.map((bout, idx) => (
                  <tr
                    key={idx}
                    className={selectedBoutIndex === idx ? 'selected-bout' : ''}
                    onClick={() => setSelectedBoutIndex(idx)}
                  >
                    <td>{bout.t_start_s.toFixed(1)}s</td>
                    <td>{bout.t_end_s.toFixed(1)}s</td>
                    <td>
                      <select
                        value={bout.bout_type}
                        onChange={(e) =>
                          handleBoutTypeChange(
                            idx,
                            e.target
                              .value as LitterboxBoutAnnotation['bout_type'],
                          )
                        }
                        className="bout-type-select"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {BOUT_TYPES.map((bt) => (
                          <option key={bt} value={bt}>
                            {t(`annotation.bout_type_${bt}`)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button
                        className="bout-delete-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteBout(idx);
                        }}
                        aria-label={t('annotation.delete_bout')}
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <DiscardUnsavedDialog
        open={discardOpen}
        onConfirm={handleConfirmDiscard}
        onCancel={handleCancelDiscard}
      />
      <ConfirmDialog
        open={pendingConfirm === 'maintenance'}
        title={t('annotation.mark_as_maintenance_aria')}
        description={t('annotation.confirm_convert_maintenance')}
        confirmLabel={t('common.confirm')}
        variant="danger"
        isConfirming={isSaving}
        onConfirm={() => {
          void handleConfirmPending();
        }}
        onCancel={handleCancelPending}
      />
      <ConfirmDialog
        open={pendingConfirm === 'clear-bouts'}
        title={t('annotation.clear_bouts')}
        description={t('annotation.confirm_clear_bouts')}
        confirmLabel={t('common.confirm')}
        variant="danger"
        onConfirm={() => {
          void handleConfirmPending();
        }}
        onCancel={handleCancelPending}
      />
      <ConfirmDialog
        open={pendingConfirm === 'reset-detector'}
        title={t('annotation.reset_detector_bouts')}
        description={t('annotation.confirm_reset_detector_bouts')}
        confirmLabel={t('common.confirm')}
        onConfirm={() => {
          void handleConfirmPending();
        }}
        onCancel={handleCancelPending}
      />
    </div>
  );
};

export default AnnotationWorkspace;
