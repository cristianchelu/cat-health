import * as React from 'react';
import type { UntrackedIntervalDTO } from 'shared';

interface UntrackedRegionOverlayProps {
  intervals: UntrackedIntervalDTO[];
  minTime: number;
  maxTime: number;
  patternId: string;
}

function getIntervalX(
  time: number,
  minTime: number,
  maxTime: number,
): number {
  if (maxTime === minTime) return 0;
  return ((time - minTime) / (maxTime - minTime)) * 100;
}

const UntrackedRegionOverlay: React.FC<UntrackedRegionOverlayProps> = ({
  intervals,
  minTime,
  maxTime,
  patternId,
}) => {
  if (intervals.length === 0 || maxTime <= minTime) {
    return null;
  }

  return (
    <>
      <defs>
        <pattern
          id={patternId}
          patternUnits="userSpaceOnUse"
          width="6"
          height="6"
          patternTransform="rotate(45)"
        >
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="6"
            stroke="var(--color-text-muted)"
            strokeWidth="2"
            opacity="0.5"
          />
        </pattern>
      </defs>
      {intervals.map((interval, index) => {
        const start = Math.max(new Date(interval.start).getTime(), minTime);
        const end = Math.min(new Date(interval.end).getTime(), maxTime);
        if (end <= start) return null;

        const x = getIntervalX(start, minTime, maxTime);
        const width = getIntervalX(end, minTime, maxTime) - x;
        if (width <= 0) return null;

        return (
          <rect
            key={`${interval.start}-${index}`}
            x={x}
            y={0}
            width={width}
            height={100}
            fill={`url(#${patternId})`}
            opacity={0.5}
          />
        );
      })}
    </>
  );
};

export default UntrackedRegionOverlay;
