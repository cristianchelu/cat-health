import * as React from 'react';
import type { UntrackedIntervalDTO } from 'shared';

interface UntrackedRegionOverlayProps {
  intervals: UntrackedIntervalDTO[];
  minTime: number;
  maxTime: number;
  patternId: string;
  chartWidth?: number;
  chartHeight?: number;
  /** Fade hatch to transparent toward the top (fraction of chart height, or true for default). */
  fadeFromTop?: boolean | number;
}

// Matches .untracked-pattern: 45deg, 4px gap + 2px stripe, 6px period
const PATTERN_SIZE = 6;
const PATTERN_STROKE = 2;

function getIntervalX(
  time: number,
  minTime: number,
  maxTime: number,
  chartWidth: number,
): number {
  if (maxTime === minTime) return 0;
  return ((time - minTime) / (maxTime - minTime)) * chartWidth;
}

const UntrackedRegionOverlay: React.FC<UntrackedRegionOverlayProps> = ({
  intervals,
  minTime,
  maxTime,
  patternId,
  chartWidth = 100,
  chartHeight = 100,
  fadeFromTop = false,
}) => {
  if (intervals.length === 0 || maxTime <= minTime) {
    return null;
  }

  const fadeFraction =
    fadeFromTop === true ? 1 : fadeFromTop === false ? 0 : fadeFromTop;
  const fadeGradientId = `${patternId}-fade`;
  const fadeMaskId = `${patternId}-fade-mask`;

  const fadeStops =
    fadeFromTop === true
      ? [
          { offset: '0%', opacity: 0 },
          { offset: '18%', opacity: 0 },
          { offset: '38%', opacity: 0.12 },
          { offset: '58%', opacity: 0.38 },
          { offset: '76%', opacity: 0.68 },
          { offset: '92%', opacity: 0.9 },
          { offset: '100%', opacity: 1 },
        ]
      : fadeFraction > 0
        ? [
            { offset: '0%', opacity: 0 },
            { offset: `${fadeFraction * 100}%`, opacity: 1 },
            { offset: '100%', opacity: 1 },
          ]
        : [];

  return (
    <>
      <defs>
        <pattern
          id={patternId}
          patternUnits="userSpaceOnUse"
          width={PATTERN_SIZE}
          height={PATTERN_SIZE}
          patternTransform="rotate(-45)"
        >
          <line
            x1="0"
            y1="0"
            x2="0"
            y2={PATTERN_SIZE}
            stroke="var(--color-text-muted)"
            strokeWidth={PATTERN_STROKE}
          />
        </pattern>
        {fadeStops.length > 0 ? (
          <>
            <linearGradient
              id={fadeGradientId}
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1="0"
              x2="0"
              y2={chartHeight}
            >
              {fadeStops.map((stop) => (
                <stop
                  key={stop.offset}
                  offset={stop.offset}
                  stopColor="white"
                  stopOpacity={stop.opacity}
                />
              ))}
            </linearGradient>
            <mask id={fadeMaskId}>
              <rect
                x={0}
                y={0}
                width={chartWidth}
                height={chartHeight}
                fill={`url(#${fadeGradientId})`}
              />
            </mask>
          </>
        ) : null}
      </defs>
      {intervals.map((interval, index) => {
        const start = Math.max(new Date(interval.start).getTime(), minTime);
        const end = Math.min(new Date(interval.end).getTime(), maxTime);
        if (end <= start) return null;

        const x = getIntervalX(start, minTime, maxTime, chartWidth);
        const isRangeEnd = end >= maxTime;
        const endX = isRangeEnd
          ? chartWidth
          : getIntervalX(end, minTime, maxTime, chartWidth);
        const width = endX - x;
        if (width <= 0) return null;

        return (
          <rect
            key={`${interval.start}-${index}`}
            x={x}
            y={0}
            width={width}
            height={chartHeight}
            fill={`url(#${patternId})`}
            opacity={0.5}
            mask={fadeStops.length > 0 ? `url(#${fadeMaskId})` : undefined}
          />
        );
      })}
    </>
  );
};

export default UntrackedRegionOverlay;
