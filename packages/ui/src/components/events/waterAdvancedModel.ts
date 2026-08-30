import {
  analyzeWaterRates,
  analyzeWaterSegments,
  DRINKING_RATE_MAX_ML_PER_MIN,
  type WaterIntakeEventDataDTO,
  type WaterPeriod,
} from 'shared';

import { zeroAnchoredRange, type PaddedRange } from '@/components/charts/range';
import type { TraceBand } from '@/components/charts/TraceLayers';

/** A rate worth naming, and where on the trace it happened. */
export interface RatePeak {
  value: number;
  index: number;
}

export interface WaterAdvancedModel {
  weights: number[];
  periods: WaterPeriod[];
  rates: number[];
  /** What the slope was taken over, for the caption. */
  windowSeconds: number;
  emaSpan: number;
  durationSeconds: number;
  startWeight: number | null;
  endWeight: number | null;
  /** Fastest lapping, and the fastest stretch the analyzer threw away. */
  peakIntake: RatePeak;
  peakExcluded: RatePeak;
  meanIntake: number;
  excludedMl: number;
  spillBands: TraceBand[];
  rateDomain: PaddedRange;
}

/**
 * A drink reduced to the numbers the advanced page reads off it.
 *
 * Domain values only — no words, no units, no `t`. What a number means is the
 * page's business; what it *is* is this, and keeping the two apart is what
 * lets the arithmetic be checked without rendering anything.
 */
export function buildWaterAdvancedModel(
  data: WaterIntakeEventDataDTO,
  weights: number[],
): WaterAdvancedModel {
  const periods = analyzeWaterSegments(weights);
  const series = analyzeWaterRates(weights);
  const rates = series.rates;

  /*
   * Read off the periods rather than off the whole series: the mean of every
   * sample would be an average over the stretches the analyzer already threw
   * away, which is the opposite of what "mean intake" means.
   */
  const peakIntake: RatePeak = { value: 0, index: -1 };
  const peakExcluded: RatePeak = { value: 0, index: -1 };
  let sum = 0;
  let count = 0;
  for (const period of periods) {
    if (period.state === 'noise') continue;
    const peak = period.state === 'drinking' ? peakIntake : peakExcluded;
    for (let i = period.start; i < period.end && i < rates.length; i++) {
      const rate = rates[i];
      if (period.state === 'drinking') {
        sum += rate;
        count += 1;
      }
      if (rate > peak.value) {
        peak.value = rate;
        peak.index = i;
      }
    }
  }

  return {
    weights,
    periods,
    rates,
    windowSeconds: series.windowSeconds,
    emaSpan: series.emaSpan,
    durationSeconds:
      data.duration ??
      (series.sampleRateHz > 0 ? weights.length / series.sampleRateHz : 0),
    startWeight: weights.length > 0 ? weights[0] : null,
    endWeight: weights.length > 0 ? weights[weights.length - 1] : null,
    peakIntake,
    peakExcluded,
    meanIntake: count > 0 ? sum / count : 0,
    excludedMl: data.excluded_amount ?? 0,
    spillBands: periods
      .filter((period) => period.state === 'spill')
      .map((period, i) => ({
        key: `spill-${i}`,
        start: period.start,
        end: period.end,
        color: 'var(--color-signal-spill)',
      })),
    /* Read against zero, and with the ceiling on screen whether or not the cat
       ever came near it — a threshold outside the box classifies nothing. */
    rateDomain: zeroAnchoredRange(rates, [DRINKING_RATE_MAX_ML_PER_MIN]),
  };
}
