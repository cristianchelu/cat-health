import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pause, Play } from 'lucide-react';
import './TimelapsePlayer.css';

interface TimelapsePlayerProps {
  frameUrls: string[];
  fps?: number;
  alt: string;
}

const TimelapsePlayer: React.FC<TimelapsePlayerProps> = ({
  frameUrls,
  fps = 1,
  alt,
}) => {
  const { t } = useTranslation();
  const [frameIndex, setFrameIndex] = React.useState(0);
  const [isPlaying, setIsPlaying] = React.useState(true);

  const intervalMs = fps > 0 ? 1000 / fps : 1000;

  React.useEffect(() => {
    setFrameIndex(0);
    setIsPlaying(true);
  }, [frameUrls]);

  React.useEffect(() => {
    if (!isPlaying || frameUrls.length <= 1) return;

    const timer = window.setInterval(() => {
      setFrameIndex((current) => (current + 1) % frameUrls.length);
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [frameUrls.length, intervalMs, isPlaying]);

  if (frameUrls.length === 0) {
    return null;
  }

  const currentUrl = frameUrls[frameIndex] ?? frameUrls[0];

  return (
    <div className="timelapse-player">
      <img
        className="timelapse-player-image"
        src={currentUrl}
        alt={alt}
      />
      {frameUrls.length > 1 && (
        <div className="timelapse-player-controls">
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
            {isPlaying ? <Pause size={18} aria-hidden /> : <Play size={18} aria-hidden />}
          </button>
          <span className="timelapse-player-counter">
            {t('event_details.timelapse_frame_counter', {
              current: frameIndex + 1,
              total: frameUrls.length,
            })}
          </span>
        </div>
      )}
    </div>
  );
};

export default TimelapsePlayer;
