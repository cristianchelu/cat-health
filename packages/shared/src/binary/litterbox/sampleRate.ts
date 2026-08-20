import type { DecodedLitterboxRawData } from './types.ts';

/** Legacy assumed rate; real hardware pushes ~7.3Hz. Prefer derived rates. */
const LEGACY_SAMPLE_HZ = 10;

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Best-available sample rate for a litterbox visit's weight trace.
 *
 * v2 blobs carry per-sample ms offsets — the true rate. v1 blobs only allow
 * the historical approximation from sample count over the visit's (rounded,
 * wall-clock) duration in seconds. Failing both, the legacy 10Hz assumption.
 */
export function deriveLitterboxSampleRateHz(
  decoded:
    | Pick<DecodedLitterboxRawData, 'weights' | 'sampleOffsetsMs'>
    | null
    | undefined,
  fallbackDurationS?: number,
): number {
  const offsets = decoded?.sampleOffsetsMs;
  if (offsets && offsets.length >= 2) {
    const spanMs = offsets[offsets.length - 1] - offsets[0];
    if (spanMs > 0) {
      return round3(((offsets.length - 1) * 1000) / spanMs);
    }
  }

  const sampleCount = decoded?.weights.length ?? 0;
  if (
    sampleCount >= 2 &&
    typeof fallbackDurationS === 'number' &&
    fallbackDurationS > 0
  ) {
    return round3((sampleCount - 1) / fallbackDurationS);
  }

  return LEGACY_SAMPLE_HZ;
}
