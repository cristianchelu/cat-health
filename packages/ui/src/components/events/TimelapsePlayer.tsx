import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { ImageOff, Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FallbackImage } from '@/components/ui/FallbackImage';
import {
  frameIndexAtTimelineSec,
  type TimelapseFrameInput,
} from './buildTimelapseTimeline';
import './TimelapsePlayer.css';

interface TimelapsePlayerProps {
  frames: TimelapseFrameInput[];
  durationSec: number;
  intervalSec?: number;
  alt: string;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function formatTimelapseTime(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function timelineSecFromPointer(
  clientX: number,
  rect: DOMRect,
  durationSec: number,
): number {
  const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
  return ratio * durationSec;
}

const TimelapsePlayer: React.FC<TimelapsePlayerProps> = ({
  frames,
  durationSec,
  intervalSec,
  alt,
}) => {
  const { t } = useTranslation();
  const [frameIndex, setFrameIndex] = React.useState(0);
  const [isPlaying, setIsPlaying] = React.useState(true);
  const [isScrubbing, setIsScrubbing] = React.useState(false);

  const trackRef = React.useRef<HTMLDivElement>(null);
  const isScrubbingRef = React.useRef(false);
  const wasPlayingBeforeScrubRef = React.useRef(false);

  const frameCount = frames.length;
  const offsets = React.useMemo(
    () => frames.map((frame) => frame.offsetSec),
    [frames],
  );
  const playbackIntervalMs = React.useMemo(() => {
    if (intervalSec && intervalSec > 0) {
      return intervalSec * 1000;
    }
    if (frameCount > 0 && durationSec > 0) {
      return Math.max((durationSec / frameCount) * 1000, 100);
    }
    return 1000;
  }, [durationSec, frameCount, intervalSec]);

  const safeDurationSec = durationSec > 0 ? durationSec : 0;
  const currentOffsetSec = offsets[frameIndex] ?? 0;
  const progress =
    safeDurationSec > 0 ? clamp(currentOffsetSec / safeDurationSec, 0, 1) : 0;

  React.useEffect(() => {
    setFrameIndex(0);
    setIsPlaying(true);
  }, [frames, durationSec, intervalSec]);

  React.useEffect(() => {
    if (!isPlaying || frameCount <= 1) return;

    const timer = window.setInterval(() => {
      setFrameIndex((current) => (current + 1) % frameCount);
    }, playbackIntervalMs);

    return () => window.clearInterval(timer);
  }, [frameCount, isPlaying, playbackIntervalMs]);

  const seekToClientX = React.useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track || frameCount <= 1 || safeDurationSec <= 0) return;
      const targetSec = timelineSecFromPointer(
        clientX,
        track.getBoundingClientRect(),
        safeDurationSec,
      );
      const index = frameIndexAtTimelineSec(
        offsets,
        safeDurationSec,
        targetSec,
      );
      setFrameIndex(index);
    },
    [frameCount, offsets, safeDurationSec],
  );

  const handleTrackPointerDown = React.useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (frameCount <= 1) return;
      e.preventDefault();
      wasPlayingBeforeScrubRef.current = isPlaying;
      isScrubbingRef.current = true;
      setIsScrubbing(true);
      setIsPlaying(false);
      e.currentTarget.setPointerCapture(e.pointerId);
      seekToClientX(e.clientX);
    },
    [frameCount, isPlaying, seekToClientX],
  );

  const handleTrackPointerMove = React.useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isScrubbingRef.current) return;
      seekToClientX(e.clientX);
    },
    [seekToClientX],
  );

  const endScrub = React.useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isScrubbingRef.current) return;
      isScrubbingRef.current = false;
      setIsScrubbing(false);
      if (wasPlayingBeforeScrubRef.current) {
        setIsPlaying(true);
      }
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    },
    [],
  );

  const handleTrackKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (frameCount <= 1) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setFrameIndex((current) => Math.max(0, current - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setFrameIndex((current) => Math.min(frameCount - 1, current + 1));
      } else if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        setIsPlaying((playing) => !playing);
      }
    },
    [frameCount],
  );

  if (frameCount === 0) {
    return null;
  }

  const currentUrl = frames[frameIndex]?.url ?? frames[0].url;

  return (
    <div className="timelapse-player">
      <FallbackImage
        className="timelapse-player-image"
        src={currentUrl}
        alt={alt}
        fit="contain"
        fallback={<ImageOff size={24} aria-hidden="true" />}
      />
      {frameCount > 1 && (
        <div className="timelapse-player-chrome">
          <div className="timelapse-player-bar">
            <button
              type="button"
              className="timelapse-player-button"
              onClick={() => setIsPlaying((playing) => !playing)}
              aria-label={
                isPlaying
                  ? t('event_details.timelapse_pause')
                  : t('event_details.timelapse_play')
              }
              title={
                isPlaying
                  ? t('event_details.timelapse_pause')
                  : t('event_details.timelapse_play')
              }
            >
              {isPlaying ? (
                <Pause size={18} aria-hidden />
              ) : (
                <Play size={18} aria-hidden />
              )}
            </button>

            <div className="timelapse-player-timeline">
              <div
                ref={trackRef}
                className={cn(
                  'timelapse-player-track',
                  isScrubbing && 'scrubbing',
                )}
                /* Scrubbing inside a phone sheet is not a drawer drag. */
                data-vaul-no-drag=""
                role="slider"
                tabIndex={0}
                aria-label={t('event_details.timelapse_seek')}
                aria-valuemin={0}
                aria-valuemax={Math.max(safeDurationSec, 0)}
                aria-valuenow={currentOffsetSec}
                onPointerDown={handleTrackPointerDown}
                onPointerMove={handleTrackPointerMove}
                onPointerUp={endScrub}
                onPointerCancel={endScrub}
                onKeyDown={handleTrackKeyDown}
              >
                <div className="timelapse-player-rail">
                  <div
                    className="timelapse-player-fill"
                    style={{ width: `${progress * 100}%` }}
                  />
                  <div
                    className="timelapse-player-thumb"
                    style={{ left: `${progress * 100}%` }}
                  />
                </div>
              </div>
            </div>

            <span className="timelapse-player-time" aria-hidden>
              {formatTimelapseTime(currentOffsetSec)} /{' '}
              {formatTimelapseTime(safeDurationSec)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default TimelapsePlayer;
