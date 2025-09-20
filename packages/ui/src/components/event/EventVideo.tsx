import * as React from 'react';
import { FaCamera } from 'react-icons/fa';
import { getEventVideoUrl, isRecordingAvailable } from '@/api/recordings';
import './EventVideo.css';

export interface EventVideoButtonProps {
  timestamp: string;
  isExpanded: boolean;
  onToggle: () => void;
  hasVideo?: boolean;
}

export interface EventVideoPlayerProps {
  timestamp: string;
}

const EventVideoButton = React.forwardRef<
  HTMLButtonElement,
  EventVideoButtonProps
>(({ timestamp, isExpanded, onToggle, hasVideo = false }, ref) => {
  const videoAvailable = hasVideo || isRecordingAvailable(timestamp);

  if (!videoAvailable) {
    return null;
  }

  return (
    <button
      ref={ref}
      className="event-video-button"
      onClick={onToggle}
      title={isExpanded ? 'Hide video' : 'Show video'}
    >
      <FaCamera />
    </button>
  );
});

EventVideoButton.displayName = 'EventVideoButton';

const EventVideoPlayer = React.forwardRef<
  HTMLDivElement,
  EventVideoPlayerProps
>(({ timestamp }, ref) => {
  return (
    <div ref={ref} className="event-video-container">
      <video
        controls
        preload="metadata"
        className="event-video"
        onError={() => {
          console.warn('Video failed to load for timestamp:', timestamp);
          // Could show a "Video not available" message here
        }}
      >
        <source src={getEventVideoUrl(timestamp)} type="video/mp4" />
        Your browser does not support the video tag.
      </video>
    </div>
  );
});

EventVideoPlayer.displayName = 'EventVideoPlayer';

export { EventVideoButton, EventVideoPlayer };
export default EventVideoButton;
