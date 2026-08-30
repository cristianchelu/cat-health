import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  analyzeWaterRates,
  analyzeWaterSegments,
  DRINKING_RATE_MAX_ML_PER_MIN,
  type WaterIntakeEventDataDTO,
} from 'shared';

import { ChartLegend } from '@/components/charts/ChartLegend';
import {
  RateTrace,
  type RateMarker,
  type RateRule,
} from '@/components/charts/RateTrace';
import type { SignalBand } from '@/components/charts/SignalTrace';
import { ReadoutGrid } from '@/components/ui/ReadoutGrid';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { useFormatters } from '@/contexts/RegionalPreferencesProvider';

import type { DecodedWaterRawData } from './decodeWaterRawData';
import WaterSignalChart from './WaterSignalChart';
import { formatClock } from './advancedDetailsFormat';

/** Both tracks share a height so the same second sits at the same x on each. */
const TRACK_HEIGHT = 88;

export interface WaterAdvancedDetailsProps {
  data: WaterIntakeEventDataDTO;
  decoded: DecodedWaterRawData;
}

interface RatePeak {
  value: number;
  index: number;
}

/**
 * A drink as the fountain's scale saw it: the bowl emptying, then how fast.
 *
 * Two tracks of the same window. The first is the load the analyzer
 * classified; the second is the slope it classified it *by*, which is the only
 * place the filter becomes visible — lapping tops out well under the ceiling,
 * so a spike over the drawn line reads as a splash rather than as water the
 * cat took. That ceiling is the analyzer's own constant, drawn rather than
 * restated, so the line and the verdict cannot drift apart.
 */
const WaterAdvancedDetails: React.FC<WaterAdvancedDetailsProps> = ({
  data,
  decoded,
}) => {
  const { t } = useTranslation();
  const { formatNumber } = useFormatters();

  const weights = decoded.weights;
  const periods = React.useMemo(() => analyzeWaterSegments(weights), [weights]);
  const series = React.useMemo(() => analyzeWaterRates(weights), [weights]);
  const rates = series.rates;

  const durationSeconds =
    data.duration ??
    (series.sampleRateHz > 0 ? weights.length / series.sampleRateHz : 0);

  /*
   * Read off the periods rather than off the whole series: the mean of every
   * sample would be an average over the stretches the analyzer already threw
   * away, which is the opposite of what "mean intake" means.
   */
  const stats = React.useMemo(() => {
    const drinking: RatePeak = { value: 0, index: -1 };
    const excluded: RatePeak = { value: 0, index: -1 };
    let sum = 0;
    let count = 0;
    for (const period of periods) {
      if (period.state === 'noise') continue;
      const peak = period.state === 'drinking' ? drinking : excluded;
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
    return { drinking, excluded, mean: count > 0 ? sum / count : 0 };
  }, [periods, rates]);

  const spillBands = React.useMemo<SignalBand[]>(
    () =>
      periods
        .filter((period) => period.state === 'spill')
        .map((period, i) => ({
          key: `spill-${i}`,
          start: period.start,
          end: period.end,
          color: 'var(--color-signal-spill)',
        })),
    [periods],
  );

  const mlPerMin = React.useCallback(
    (value: number) =>
      t('event_details.advanced_ml_per_min', {
        value: formatNumber(Math.round(value)),
      }),
    [t, formatNumber],
  );

  const rules = React.useMemo<RateRule[]>(
    () => [
      {
        key: 'ceiling',
        value: DRINKING_RATE_MAX_ML_PER_MIN,
        label: mlPerMin(DRINKING_RATE_MAX_ML_PER_MIN),
      },
    ],
    [mlPerMin],
  );

  const markers = React.useMemo<RateMarker[]>(() => {
    const out: RateMarker[] = [];
    if (stats.drinking.index >= 0) {
      out.push({
        key: 'peak-intake',
        index: stats.drinking.index,
        label: mlPerMin(stats.drinking.value),
      });
    }
    if (stats.excluded.index >= 0) {
      out.push({
        key: 'peak-excluded',
        index: stats.excluded.index,
        label: mlPerMin(stats.excluded.value),
        tone: 'alert',
      });
    }
    return out;
  }, [stats, mlPerMin]);

  const grams = (value: number) =>
    t('event_details.advanced_grams', {
      value: formatNumber(Math.round(value)),
    });

  return (
    <>
      <section className="event-advanced-section">
        <SectionLabel
          aside={[
            t('event_details.advanced_samples', {
              value: formatNumber(weights.length),
            }),
            t('event_details.advanced_smoothing_ema', {
              value: series.emaSpan,
            }),
          ].join(' · ')}
        >
          {t('event_details.advanced_bowl_load')}
        </SectionLabel>
        <WaterSignalChart
          weights={weights}
          periods={periods}
          legendVariant="inline"
          height={TRACK_HEIGHT}
        />
        <ReadoutGrid
          readouts={[
            {
              key: 'length',
              label: t('event_details.advanced_length'),
              value: formatClock(durationSeconds),
            },
            {
              key: 'start-weight',
              label: t('event_details.advanced_start_weight'),
              value: weights.length > 0 ? grams(weights[0]) : '—',
            },
            {
              key: 'end-weight',
              label: t('event_details.advanced_end_weight'),
              value:
                weights.length > 0 ? grams(weights[weights.length - 1]) : '—',
            },
          ]}
        />
      </section>

      <section className="event-advanced-section">
        <SectionLabel
          aside={t('event_details.advanced_rate_window', {
            value: series.windowSeconds,
          })}
        >
          {t('event_details.advanced_intake_rate')}
        </SectionLabel>
        <RateTrace
          values={rates}
          bands={spillBands}
          rules={rules}
          markers={markers}
          axisStart={formatClock(0)}
          axisEnd={formatClock(durationSeconds)}
          height={TRACK_HEIGHT}
        />
        <ChartLegend
          variant="inline"
          items={[
            {
              tone: 'var(--color-water)',
              label: t('event_details.legend_intake_rate'),
            },
            {
              tone: 'var(--color-signal-spill)',
              label: t('event_details.legend_spill_excluded'),
            },
          ]}
        />
        <ReadoutGrid
          readouts={[
            {
              key: 'peak-intake',
              label: t('event_details.advanced_peak_intake'),
              value: mlPerMin(stats.drinking.value),
            },
            {
              key: 'mean-rate',
              label: t('event_details.advanced_mean_rate'),
              value: mlPerMin(stats.mean),
            },
            {
              key: 'excluded',
              label: t('event_details.advanced_excluded'),
              value: t('event_details.advanced_millilitres', {
                value: formatNumber(data.excluded_amount ?? 0),
              }),
            },
          ]}
        />
      </section>
    </>
  );
};

export default WaterAdvancedDetails;
