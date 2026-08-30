import {
  deriveLitterboxSampleRateHz,
  type LitterboxUseEventDataDTO,
} from 'shared';

import type { TraceBand } from '@/components/charts/TraceLayers';

import type { DecodedLitterboxRawData } from './decodeLitterboxRawData';
import { trimmedSliceMeanSigma } from './litterboxPeriodStats';

/** The analyzer's four states, and the tint each is drawn in. */
export const LITTERBOX_STATE_COLORS: Record<string, string> = {
  entering: 'var(--color-signal-entering)',
  occupied: 'var(--color-signal-occupied)',
  eliminating: 'var(--color-signal-eliminating)',
  gap: 'var(--color-signal-gap)',
};

export const LITTERBOX_STATE_LABEL_KEYS: Record<string, string> = {
  entering: 'event_details.legend_entering',
  occupied: 'event_details.legend_occupied',
  eliminating: 'event_details.legend_eliminating',
  gap: 'event_details.legend_gap',
};

export const ELIMINATION_LABEL_KEYS: Record<string, string> = {
  urination: 'overview.urination',
  defecation: 'overview.defecation',
};

/** One analyzer period, measured. */
export interface LitterboxSection {
  key: string;
  state: string;
  color: string;
  lengthSeconds: number;
  /**
   * Spread of the load over the period, or null where it is too short to
   * survive the edge trim. On an eliminating period this is what the device
   * thresholds to tell urination from defecation.
   */
  sigma: number | null;
  /** The verdict that σ produced, where the analyzer recorded one. */
  eliminationType: string | null;
}

export interface LitterboxAdvancedModel {
  weights: number[];
  sampleRateHz: number;
  durationSeconds: number;
  startWeight: number | null;
  endWeight: number | null;
  bands: TraceBand[];
  sections: LitterboxSection[];
}

/**
 * A visit reduced to the numbers the advanced page reads off it.
 *
 * Domain values only — the label keys above are constants the page looks up,
 * not text this resolves. σ is recomputed here because the persisted segments
 * never carried it; see {@link trimmedSliceMeanSigma}.
 */
export function buildLitterboxAdvancedModel(
  data: LitterboxUseEventDataDTO,
  decoded: DecodedLitterboxRawData,
): LitterboxAdvancedModel {
  const weights = decoded.weights;
  /* v2 blobs carry per-sample offsets, so the real rate is ~7.3 Hz on the
     hardware rather than the nominal 10 the legacy path assumed. */
  const sampleRateHz = deriveLitterboxSampleRateHz(decoded, data.duration);
  const segments = data.segments ?? [];

  return {
    weights,
    sampleRateHz,
    durationSeconds: data.duration,
    startWeight: weights.length > 0 ? weights[0] : null,
    endWeight: weights.length > 0 ? weights[weights.length - 1] : null,
    bands: segments.map((segment, i) => ({
      key: `${segment.state}-${i}`,
      start: segment.start,
      end: segment.end,
      color: LITTERBOX_STATE_COLORS[segment.state] ?? 'transparent',
    })),
    sections: segments.map((segment, i) => ({
      key: `${segment.state}-${i}`,
      state: segment.state,
      color: LITTERBOX_STATE_COLORS[segment.state] ?? 'transparent',
      lengthSeconds:
        sampleRateHz > 0 ? (segment.end - segment.start) / sampleRateHz : 0,
      sigma:
        trimmedSliceMeanSigma(weights, segment.start, segment.end)?.sigma ??
        null,
      eliminationType: segment.elimination_type ?? null,
    })),
  };
}
