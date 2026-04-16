import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCheck, AlertCircle, Trash2, Loader2, RotateCcw, Ban, Wrench, Video, Sparkles } from 'lucide-react';
import { useAnalyzeLitterboxEvent, useEventMedia, usePatchEvent } from '@/hooks/queries/eventQueries';
import { usePets } from '@/hooks/queries/petQueries';
import { Select } from '@/components/ui/form/Select';
import { Button } from '@/components/ui/Button';
import WeightSignalChart from '@/components/events/WeightSignalChart';
import { decodeLitterboxRawData } from '@/components/events/decodeLitterboxRawData';
import { deriveDetectorBouts } from '@/lib/litterboxDetectorBouts';
import type {
  GetEventDTO,
  LitterboxAnalysisStatePeriod,
  LitterboxUseEliminationType,
} from 'shared';
import type { LitterboxBoutAnnotation, LitterboxAnnotation } from '@/types/litterbox';
import './AnnotationWorkspace.css';

/** Stable fallback so `periods` stays referentially equal when there are no analyzer segments. */
const EMPTY_ANALYSIS_PERIODS: LitterboxAnalysisStatePeriod[] = [];

interface AnnotationWorkspaceProps {
  event: GetEventDTO;
  /** From URL (`video=1`); panel visibility for media strip. */
  videoOpen: boolean;
  onVideoOpenChange: (open: boolean) => void;
  actionsRef?: React.MutableRefObject<AnnotationWorkspaceActions | null>;
  onConvertedToMaintenance?: () => void;
}

const BOUT_TYPES: LitterboxBoutAnnotation['bout_type'][] = ['urination', 'defecation', 'unknown'];

const ELIMINATION_TYPES: { value: LitterboxUseEliminationType; label: string }[] = [
  { value: 'urination', label: 'overview.urination' },
  { value: 'defecation', label: 'overview.defecation' },
  { value: 'both', label: 'overview.both' },
  { value: 'no_elimination', label: 'overview.no_elimination' },
  { value: 'unknown', label: 'common.unknown' },
];

function getBouts(event: GetEventDTO): LitterboxBoutAnnotation[] {
  const data = event.data as { annotation?: LitterboxAnnotation };
  return data.annotation?.bouts ?? [];
}

function hasPersistedBouts(event: GetEventDTO): boolean {
  const d = event.data as { annotation?: unknown };
  if (!d.annotation || typeof d.annotation !== 'object') return false;
  return Object.prototype.hasOwnProperty.call(d.annotation as Record<string, unknown>, 'bouts');
}

/** Select value "null" = unknown cat; only positive DB ids are sent (never 0/NaN — JSON would show null for NaN). */
function resolvePetIdFromSelect(nextPetId: string): number | null {
  if (nextPetId === 'null' || nextPetId.trim() === '') return null;
  const n = Number.parseInt(nextPetId, 10);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return null;
  return n;
}

export interface AnnotationWorkspaceActions {
  toggleVideo: () => void;
  toggleStraining: () => void;
  toggleVerified: () => Promise<void>;
  toggleExcluded: () => Promise<void>;
  setVerified: (next: boolean) => Promise<void>;
  deleteSelectedBout: () => void;
  selectAdjacentBout: (direction: -1 | 1) => void;
  clearAllBouts: () => Promise<void>;
  resetToDetector: () => Promise<void>;
  setSelectedBoutType: (boutType: LitterboxBoutAnnotation['bout_type']) => void;
  clearSelection: () => void;
  convertToMaintenance: () => Promise<void>;
  reanalyze: () => void;
  setEventEliminationType: (t: LitterboxUseEliminationType) => void;
}

const AnnotationWorkspace: React.FC<AnnotationWorkspaceProps> = ({
  event,
  videoOpen,
  onVideoOpenChange,
  actionsRef,
  onConvertedToMaintenance,
}) => {
  const { t } = useTranslation();
  /** Avoid `useMutation` here: it re-renders via useSyncExternalStore on every mutation state tick. */
  const { patchEvent, isPatching: isSaving } = usePatchEvent();
  const { mutateAsync: runAnalyzeAsync, isPending: isAnalyzing } = useAnalyzeLitterboxEvent();
  const { data: pets } = usePets();
  const { data: media, isLoading: isLoadingMedia } = useEventMedia(event.id);

  const data = event.data as {
    elimination_type?: LitterboxUseEliminationType;
    straining?: boolean;
    annotation?: LitterboxAnnotation;
    duration?: number;
  };

  const decodedRaw = React.useMemo(() => decodeLitterboxRawData(event.raw_data), [event.raw_data]);
  const weights = React.useMemo(() => decodedRaw?.weights ?? [], [decodedRaw]);

  const segmentsFromServer = (
    event.data as { segments?: LitterboxAnalysisStatePeriod[] | null }
  ).segments;

  const analysisResult = React.useMemo(() => {
    if (segmentsFromServer == null) return null;
    return { periods: segmentsFromServer };
  }, [segmentsFromServer]);

  const sampleRate = React.useMemo(() => {
    if (!weights.length || !data.duration) return 10;
    return Math.round(((weights.length - 1) / data.duration) * 1000) / 1000;
  }, [weights.length, data.duration]);

  const detectorBouts = React.useMemo(() => {
    if (!analysisResult) return [];
    return deriveDetectorBouts(analysisResult.periods, sampleRate);
  }, [analysisResult, sampleRate]);

  const [localBouts, setLocalBouts] = React.useState<LitterboxBoutAnnotation[]>(() => {
    if (hasPersistedBouts(event)) return getBouts(event);
    return detectorBouts;
  });
  const [selectedBoutIndex, setSelectedBoutIndex] = React.useState<number | null>(null);
  const [petId, setPetId] = React.useState<string>(event.pet_id != null ? String(event.pet_id) : 'null');
  const [eliminationType, setEliminationType] = React.useState<LitterboxUseEliminationType>(
    data.elimination_type ?? 'unknown',
  );
  const [straining, setStraining] = React.useState<boolean>(data.straining ?? false);
  const [excluded, setExcluded] = React.useState<boolean>(data.annotation?.excluded ?? false);

  // Reset state when event changes
  React.useEffect(() => {
    if (hasPersistedBouts(event)) setLocalBouts(getBouts(event));
    else setLocalBouts(detectorBouts);
    setSelectedBoutIndex(null);
    setPetId(event.pet_id != null ? String(event.pet_id) : 'null');
    const d = event.data as {
      elimination_type?: LitterboxUseEliminationType;
      straining?: boolean;
      annotation?: LitterboxAnnotation;
    };
    setEliminationType(d.elimination_type ?? 'unknown');
    setStraining(d.straining ?? false);
    setExcluded(d.annotation?.excluded ?? false);
  }, [event.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Latest server event snapshot; avoids re-creating `save` when `event.data` identity changes (refetch / mutation). */
  const eventIdRef = React.useRef(event.id);
  const eventDataRef = React.useRef(event.data);
  eventIdRef.current = event.id;
  eventDataRef.current = event.data;

  const flushSave = React.useCallback(
    async (
      nextBouts: LitterboxBoutAnnotation[],
      nextPetId: string,
      nextElimType: LitterboxUseEliminationType,
      nextStraining: boolean,
      humanVerified: boolean,
      nextExcluded: boolean,
    ) => {
      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
      saveDebounceRef.current = null;
      const eventData = eventDataRef.current;
      const eventId = eventIdRef.current;
      const resolvedPetId = resolvePetIdFromSelect(nextPetId);
      const prevAnn = (eventData as { annotation?: LitterboxAnnotation }).annotation;
      await patchEvent({
        eventId,
        data: {
          pet_id: resolvedPetId,
          data: {
            ...eventData,
            elimination_type: nextElimType,
            straining: nextStraining,
            annotation: {
              ...(prevAnn ?? {}),
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

  const save = React.useCallback(
    (
      nextBouts: LitterboxBoutAnnotation[],
      nextPetId: string,
      nextElimType: LitterboxUseEliminationType,
      nextStraining: boolean,
      humanVerified: boolean,
      nextExcluded: boolean,
    ) => {
      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
      saveDebounceRef.current = setTimeout(() => {
        const eventData = eventDataRef.current;
        const eventId = eventIdRef.current;
        const resolvedPetId = resolvePetIdFromSelect(nextPetId);
        const prevAnn = (eventData as { annotation?: LitterboxAnnotation }).annotation;
        void patchEvent({
          eventId,
          data: {
            pet_id: resolvedPetId,
            data: {
              ...eventData,
              elimination_type: nextElimType,
              straining: nextStraining,
              annotation: {
                ...(prevAnn ?? {}),
                bouts: nextBouts,
                excluded: nextExcluded,
              },
            },
            human_verified: humanVerified,
          },
        });
      }, 500);
    },
    [patchEvent],
  );

  const handleBoutsChange = React.useCallback(
    (bouts: LitterboxBoutAnnotation[]) => {
      setLocalBouts(bouts);
      save(bouts, petId, eliminationType, straining, event.human_verified, excluded);
    },
    [petId, eliminationType, straining, event.human_verified, excluded, save],
  );

  const handlePetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setPetId(e.target.value);
    save(localBouts, e.target.value, eliminationType, straining, event.human_verified, excluded);
  };

  const handleEliminationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value as LitterboxUseEliminationType;
    setEliminationType(val);
    save(localBouts, petId, val, straining, event.human_verified, excluded);
  };

  const setEventEliminationType = React.useCallback(
    (val: LitterboxUseEliminationType) => {
      setEliminationType(val);
      save(localBouts, petId, val, straining, event.human_verified, excluded);
    },
    [localBouts, petId, save, straining, event.human_verified, excluded],
  );

  const handleStrainingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setStraining(e.target.checked);
    save(localBouts, petId, eliminationType, e.target.checked, event.human_verified, excluded);
  };

  const handleToggleVerified = async () => {
    const next = !event.human_verified;
    await flushSave(localBouts, petId, eliminationType, straining, next, excluded);
  };

  const handleToggleExcluded = async () => {
    const next = !excluded;
    setExcluded(next);
    await flushSave(localBouts, petId, eliminationType, straining, event.human_verified, next);
  };

  const handleConvertToMaintenance = React.useCallback(async () => {
    const ok = window.confirm(t('annotation.confirm_convert_maintenance'));
    if (!ok) return;
    if (saveDebounceRef.current) {
      clearTimeout(saveDebounceRef.current);
      saveDebounceRef.current = null;
    }
    await patchEvent({
      eventId: event.id,
      data: {
        pet_id: null,
        data: {
          type: 'litterbox_maintenance',
          maintenance_type: 'scoop',
        },
        human_verified: true,
      },
    });
    onConvertedToMaintenance?.();
  }, [event.id, onConvertedToMaintenance, patchEvent, t]);

  const handleBoutTypeChange = React.useCallback((idx: number, boutType: LitterboxBoutAnnotation['bout_type']) => {
    const next = localBouts.map((b, i) => (i === idx ? { ...b, bout_type: boutType } : b));
    handleBoutsChange(next);
  }, [handleBoutsChange, localBouts]);

  const handleDeleteBout = React.useCallback((idx: number) => {
    const next = localBouts
      .filter((_, i) => i !== idx)
      .map((b, i) => ({ ...b, bout_index: i }));
    if (selectedBoutIndex === idx) setSelectedBoutIndex(null);
    else if (selectedBoutIndex !== null && selectedBoutIndex > idx) setSelectedBoutIndex(selectedBoutIndex - 1);
    handleBoutsChange(next);
  }, [handleBoutsChange, localBouts, selectedBoutIndex]);

  const petOptions = [
    { value: 'null', label: t('common.unknown') },
    ...(pets ?? []).map((p) => ({ value: String(p.id), label: p.name })),
  ];

  const eliminationOptions = ELIMINATION_TYPES.map(({ value, label }) => ({
    value,
    label: t(label),
  }));

  const hasRawData = weights.length > 0;

  const handleReanalyze = React.useCallback(async () => {
    if (!hasRawData || isSaving || isAnalyzing) return;
    const preserveElim = eliminationType;
    const preserveStrain = straining;
    try {
      const updated = await runAnalyzeAsync(event.id);
      const ud = updated.data as {
        segments?: LitterboxAnalysisStatePeriod[] | null;
      };
      eventDataRef.current = {
        ...updated.data,
        elimination_type: preserveElim,
        straining: preserveStrain,
      };

      const periods = ud.segments ?? [];
      const next = periods.length === 0 ? [] : deriveDetectorBouts(periods, sampleRate);
      setSelectedBoutIndex(next.length > 0 ? 0 : null);
      setLocalBouts(next);

      await flushSave(next, petId, preserveElim, preserveStrain, updated.human_verified, excluded);
    } catch {
      // Request failed (e.g. missing raw_data); list/detail queries still refresh on success path only.
    }
  }, [
    eliminationType,
    excluded,
    event.id,
    flushSave,
    hasRawData,
    isAnalyzing,
    isSaving,
    petId,
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
  const [videoDurationSec, setVideoDurationSec] = React.useState<number | null>(null);
  const [playheadChartSec, setPlayheadChartSec] = React.useState<number | null>(null);

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
      if (videoTimeRafRef.current != null) cancelAnimationFrame(videoTimeRafRef.current);
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
    if (!hasVideo || !showMediaSection || chartDurationSec <= 0) return undefined;
    return {
      playheadChartSec,
      onAxisSeek: handleAxisSeek,
    };
  }, [chartDurationSec, handleAxisSeek, hasVideo, playheadChartSec, showMediaSection]);

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
      toggleStraining: () => {
        const next = !straining;
        setStraining(next);
        save(localBouts, petId, eliminationType, next, event.human_verified, excluded);
      },
      toggleVerified: async () => {
        await flushSave(localBouts, petId, eliminationType, straining, !event.human_verified, excluded);
      },
      toggleExcluded: async () => {
        const next = !excluded;
        setExcluded(next);
        await flushSave(localBouts, petId, eliminationType, straining, event.human_verified, next);
      },
      setVerified: async (next) => {
        await flushSave(localBouts, petId, eliminationType, straining, next, excluded);
      },
      deleteSelectedBout: () => {
        if (selectedBoutIndex == null) return;
        handleDeleteBout(selectedBoutIndex);
      },
      selectAdjacentBout: (direction) => {
        if (!localBouts.length) return;
        const idx = selectedBoutIndex ?? (direction === 1 ? -1 : localBouts.length);
        const next = Math.max(0, Math.min(localBouts.length - 1, idx + direction));
        setSelectedBoutIndex(next);
      },
      clearAllBouts: async () => {
        if (localBouts.length > 0) {
          const ok = window.confirm(t('annotation.confirm_clear_bouts'));
          if (!ok) return;
        }
        setSelectedBoutIndex(null);
        setLocalBouts([]);
        await flushSave([], petId, eliminationType, straining, event.human_verified, excluded);
      },
      resetToDetector: async () => {
        if (!analysisResult) return;
        if (localBouts.length > 0) {
          const ok = window.confirm(t('annotation.confirm_reset_detector_bouts'));
          if (!ok) return;
        }
        const next = deriveDetectorBouts(analysisResult.periods, sampleRate);
        setSelectedBoutIndex(next.length ? 0 : null);
        setLocalBouts(next);
        await flushSave(next, petId, eliminationType, straining, event.human_verified, excluded);
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
    handleBoutTypeChange,
    handleConvertToMaintenance,
    handleReanalyze,
    setEventEliminationType,
    handleDeleteBout,
    localBouts,
    petId,
    sampleRate,
    save,
    selectedBoutIndex,
    straining,
    t,
  ]);

  return (
    <div className="annotation-workspace">
      {showMediaSection && (
        <div className="annotation-workspace-media" aria-label={t('event_details.media')}>
          {isLoadingMedia && (
            <div className="annotation-media-loading">
              <Loader2 size={28} aria-hidden className="annotation-media-spinner" />
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
                      setVideoDurationSec(Number.isFinite(d) && d > 0 ? d : null);
                      const cDur = chartDurationSec;
                      if (cDur <= 0) return;
                      const vd = Number.isFinite(d) && d > 0 ? d : null;
                      if (vd != null) {
                        setPlayheadChartSec(
                          Math.max(0, Math.min((el.currentTime / vd) * cDur, cDur)),
                        );
                      } else {
                        setPlayheadChartSec(Math.max(0, Math.min(el.currentTime, cDur)));
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
            <p className="annotation-media-empty">{t('annotation.no_event_video')}</p>
          )}
        </div>
      )}

      {/* TODO(perf): Chart bout drag still lags during/overlapping PATCH saves; usePatchEvent/memo not enough.
          Suspect query invalidation/refetch, parent re-renders, analyze mutation, or drag render path—profile and isolate chart / narrow invalidation / batch drag updates. */}
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
              <label className="annotation-control-label">{t('annotation.pet_id_short')}</label>
              <Select
                options={petOptions}
                value={petId}
                onChange={handlePetChange}
                className="annotation-select"
                disabled={isSaving}
              />
            </div>
            <div className="annotation-control-group">
              <label className="annotation-control-label">{t('annotation.session_type_short')}</label>
              <Select
                options={eliminationOptions}
                value={eliminationType}
                onChange={handleEliminationChange}
                className="annotation-select"
                disabled={isSaving}
              />
            </div>
            <div className="annotation-control-group annotation-control-group--straining">
              <label className="annotation-control-label" htmlFor="annotation-straining">
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
                aria-label={videoOpen ? t('annotation.hide_video') : t('annotation.show_video')}
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
                disabled={isSaving || isAnalyzing || !hasRawData}
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
                disabled={isSaving}
                className="annotation-icon-action-btn"
                aria-label={event.human_verified ? t('annotation.verified') : t('annotation.mark_verified')}
                title={event.human_verified ? t('annotation.verified') : t('annotation.mark_verified')}
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
        </div>

        <div className="annotation-bouts-section">
          <div className="annotation-bouts-header">
            <div className="annotation-bouts-keys" aria-label={t('annotation.keyboard_hints_aria')}>
              <span className="annotation-kbd-hint">
                <kbd className="annotation-kbd">v</kbd>
                {' '}
                {t('annotation.kbd_v')}
              </span>
              <span className="annotation-kbd-hint-sep" aria-hidden>,</span>
              <span className="annotation-kbd-hint">
                <span className="annotation-kbd-cluster">
                  <kbd className="annotation-kbd annotation-kbd--wide">Shift</kbd>
                  <span className="annotation-kbd-join">+</span>
                  <kbd className="annotation-kbd">V</kbd>
                </span>
                {' '}
                {t('annotation.kbd_shift_v')}
              </span>
              <span className="annotation-kbd-hint-sep" aria-hidden>,</span>
              <span className="annotation-kbd-hint">
                <kbd className="annotation-kbd">x</kbd>
                {' '}
                {t('annotation.kbd_x')}
              </span>
              <span className="annotation-kbd-hint-sep" aria-hidden>,</span>
              <span className="annotation-kbd-hint">
                <kbd className="annotation-kbd">s</kbd>
                {' '}
                {t('annotation.kbd_s')}
              </span>
              <span className="annotation-kbd-hint-sep" aria-hidden>,</span>
              <span className="annotation-kbd-hint">
                <kbd className="annotation-kbd">r</kbd>
                {' '}
                {t('annotation.kbd_r')}
              </span>
              <span className="annotation-kbd-hint-sep" aria-hidden>,</span>
              <span className="annotation-kbd-hint">
                <span className="annotation-kbd-cluster">
                  <kbd className="annotation-kbd annotation-kbd--wide">Shift</kbd>
                  <span className="annotation-kbd-join">+</span>
                  <kbd className="annotation-kbd">M</kbd>
                </span>
                {' '}
                {t('annotation.kbd_shift_m')}
              </span>
              <span className="annotation-kbd-hint-sep" aria-hidden>,</span>
              <span className="annotation-kbd-hint">
                <kbd className="annotation-kbd">g</kbd>
                {' '}
                {t('annotation.kbd_g')}
              </span>
              <span className="annotation-kbd-hint-sep" aria-hidden>,</span>
              <span className="annotation-kbd-hint">
                <span className="annotation-kbd-cluster">
                  <kbd className="annotation-kbd">n</kbd>
                  <span className="annotation-kbd-join">/</span>
                  <kbd className="annotation-kbd">p</kbd>
                </span>
                {' '}
                {t('annotation.kbd_np')}
              </span>
              <span className="annotation-kbd-hint-sep" aria-hidden>,</span>
              <span className="annotation-kbd-hint">
                <span className="annotation-kbd-cluster">
                  <kbd className="annotation-kbd">1</kbd>
                  <span className="annotation-kbd-join">/</span>
                  <kbd className="annotation-kbd">2</kbd>
                  <span className="annotation-kbd-join">/</span>
                  <kbd className="annotation-kbd">3</kbd>
                </span>
                {' '}
                {t('annotation.kbd_123')}
              </span>
              <span className="annotation-kbd-hint-sep" aria-hidden>,</span>
              <span className="annotation-kbd-hint">
                <span className="annotation-kbd-cluster">
                  <kbd className="annotation-kbd annotation-kbd--wide">Alt</kbd>
                  <span className="annotation-kbd-join">+</span>
                  <kbd className="annotation-kbd">1–5</kbd>
                </span>
                {' '}
                {t('annotation.kbd_main_elim')}
              </span>
              <span className="annotation-kbd-hint-sep" aria-hidden>,</span>
              <span className="annotation-kbd-hint">
                <span className="annotation-kbd-cluster">
                  <kbd className="annotation-kbd annotation-kbd--narrow">[</kbd>
                  <kbd className="annotation-kbd annotation-kbd--narrow">]</kbd>
                </span>
                {' '}
                {t('annotation.kbd_brackets')}
              </span>
              <span className="annotation-kbd-hint-sep" aria-hidden>,</span>
              <span className="annotation-kbd-hint">
                <kbd className="annotation-kbd annotation-kbd--wide">Del</kbd>
                {' '}
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
                        onChange={(e) => handleBoutTypeChange(idx, e.target.value as LitterboxBoutAnnotation['bout_type'])}
                        className="bout-type-select"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {BOUT_TYPES.map((bt) => (
                          <option key={bt} value={bt}>{t(`annotation.bout_type_${bt}`)}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button
                        className="bout-delete-btn"
                        onClick={(e) => { e.stopPropagation(); handleDeleteBout(idx); }}
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
    </div>
  );
};

export default AnnotationWorkspace;
