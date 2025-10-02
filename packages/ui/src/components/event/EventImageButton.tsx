import * as React from 'react';

interface EventImageButtonProps {
  timestamp: string;
  type: string;
  onClick?: () => void;
  className?: string;
  width?: number;
  height?: number;
}

function formatTimestamp(ts: string) {
  // Expecting ISO string, convert to yyyyMMdd_HHmmss
  const d = new Date(ts);
  // Subtract 3 hours to convert from UTC to local time (assuming local is UTC-3)
  d.setHours(d.getHours() - 3);

  const pad = (n: number) => n.toString().padStart(2, '0');
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    '_' +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

const EventImageButton = React.forwardRef<
  HTMLImageElement,
  EventImageButtonProps
>(({ timestamp, type, width = 80, height = 28 }, ref) => {
  const formatted = formatTimestamp(timestamp);
  const src = `/api/images/event_${formatted}_${type}.jpg`;
  return (
    <img
      src={src}
      ref={ref}
      alt="Event snapshot"
      width={width}
      height={height}
      style={{ objectFit: 'cover', borderRadius: '4px' }}
      loading="lazy"
    />
  );
});

EventImageButton.displayName = 'EventImageButton';

export type { EventImageButtonProps };
export default EventImageButton;
