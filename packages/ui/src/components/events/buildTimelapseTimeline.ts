import type { GetEventMediaResponseDTO } from 'shared';

export interface TimelapseFrameInput {
  url: string;
  offsetSec: number;
}

export interface TimelapseTimeline {
  frames: TimelapseFrameInput[];
  durationSec: number;
  intervalSec?: number;
}

type MediaRow = GetEventMediaResponseDTO[number];

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function readCaptureConfig(frames: MediaRow[]): {
  intervalSec?: number;
  firstFrameDelaySec: number;
} {
  for (const frame of frames) {
    const intervalSec = readNumber(frame.metadata?.intervalSec);
    const firstFrameDelaySec = readNumber(frame.metadata?.firstFrameDelaySec);
    if (intervalSec !== undefined || firstFrameDelaySec !== undefined) {
      return {
        intervalSec,
        firstFrameDelaySec: firstFrameDelaySec ?? 0,
      };
    }
  }
  return { firstFrameDelaySec: 0 };
}

function offsetsFromCaptureConfig(
  frameCount: number,
  intervalSec: number,
  firstFrameDelaySec: number,
): number[] {
  const step = intervalSec > 0 ? intervalSec : 0;
  return Array.from(
    { length: frameCount },
    (_, i) => firstFrameDelaySec + i * step,
  );
}

function offsetsFromDurationFallback(
  frameCount: number,
  durationSec: number,
): number[] {
  const step = durationSec / frameCount;
  return Array.from({ length: frameCount }, (_, i) => i * step);
}

export function buildTimelapseTimeline(
  imageFrames: MediaRow[],
  eventDurationSec?: number,
): TimelapseTimeline | null {
  if (imageFrames.length <= 1) return null;

  const frameCount = imageFrames.length;
  const storedOffsets = imageFrames.map((frame) =>
    readNumber(frame.metadata?.captureOffsetSec),
  );
  const hasStoredOffsets = storedOffsets.every(
    (offset) => offset !== undefined,
  );

  let offsets: number[];
  let intervalSec: number | undefined;

  if (hasStoredOffsets) {
    offsets = storedOffsets as number[];
    intervalSec = readCaptureConfig(imageFrames).intervalSec;
    if (intervalSec !== undefined && intervalSec <= 0) {
      intervalSec = undefined;
    }
  } else {
    const captureConfig = readCaptureConfig(imageFrames);
    if (captureConfig.intervalSec !== undefined) {
      offsets = offsetsFromCaptureConfig(
        frameCount,
        captureConfig.intervalSec,
        captureConfig.firstFrameDelaySec,
      );
      intervalSec =
        captureConfig.intervalSec > 0 ? captureConfig.intervalSec : undefined;
    } else {
      const durationSec =
        eventDurationSec && eventDurationSec > 0
          ? eventDurationSec
          : frameCount;
      offsets = offsetsFromDurationFallback(frameCount, durationSec);
      intervalSec = durationSec / frameCount;
    }
  }

  const durationSec =
    eventDurationSec && eventDurationSec > 0
      ? eventDurationSec
      : Math.max(...offsets, 0);

  return {
    frames: imageFrames.map((frame, index) => ({
      url: `api/media/${frame.file_path}`,
      offsetSec: offsets[index],
    })),
    durationSec,
    intervalSec,
  };
}

export function frameIndexAtTimelineSec(
  offsets: number[],
  durationSec: number,
  targetSec: number,
): number {
  if (offsets.length <= 1) return 0;

  const clampedSec = Math.min(Math.max(targetSec, 0), durationSec);
  let bestIndex = 0;
  let bestDistance = Infinity;

  for (let i = 0; i < offsets.length; i++) {
    const distance = Math.abs(offsets[i] - clampedSec);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }

  return bestIndex;
}
