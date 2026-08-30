import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  DRINKING_RATE_MAX_ML_PER_MIN,
  type WaterIntakeEventDataDTO,
} from 'shared';

import { ChartLegend } from '@/components/charts/ChartLegend';
import { Trace } from '@/components/charts/Trace';
import {
  TraceArea,
  TraceAxis,
  TraceBands,
  TraceLine,
  TraceMarker,
  TraceRule,
  TraceRuleLabel,
} from '@/components/charts/TraceLayers';
import { ReadoutGrid } from '@/components/ui/ReadoutGrid';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { useFormatters } from '@/contexts/RegionalPreferencesProvider';

import type { DecodedWaterRawData } from './decodeWaterRawData';
import WaterSignalChart from './WaterSignalChart';
import { formatClock } from './advancedDetailsFormat';
import { buildWaterAdvancedModel } from './waterAdvancedModel';

/** Both tracks share a height so the same second sits at the same x on each. */
const TRACK_HEIGHT = 88;

export interface WaterAdvancedDetailsProps {
  data: WaterIntakeEventDataDTO;
  decoded: DecodedWaterRawData;
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

  const model = React.useMemo(
    () => buildWaterAdvancedModel(data, decoded.weights),
    [data, decoded],
  );

  const mlPerMin = (value: number) =>
    t('event_details.advanced_ml_per_min', {
      value: formatNumber(Math.round(value)),
    });
  const grams = (value: number | null) =>
    value == null
      ? '—'
      : t('event_details.advanced_grams', {
          value: formatNumber(Math.round(value)),
        });

  return (
    <>
      <section className="event-advanced-section">
        <SectionLabel
          aside={[
            t('event_details.advanced_samples', {
              value: formatNumber(model.weights.length),
            }),
            t('event_details.advanced_smoothing_ema', {
              value: model.emaSpan,
            }),
          ].join(' · ')}
        >
          {t('event_details.advanced_bowl_load')}
        </SectionLabel>
        <WaterSignalChart
          weights={model.weights}
          periods={model.periods}
          legendVariant="inline"
          height={TRACK_HEIGHT}
        />
        <ReadoutGrid
          readouts={[
            {
              key: 'length',
              label: t('event_details.advanced_length'),
              value: formatClock(model.durationSeconds),
            },
            {
              key: 'start-weight',
              label: t('event_details.advanced_start_weight'),
              value: grams(model.startWeight),
            },
            {
              key: 'end-weight',
              label: t('event_details.advanced_end_weight'),
              value: grams(model.endWeight),
            },
          ]}
        />
      </section>

      <section className="event-advanced-section">
        <SectionLabel
          aside={t('event_details.advanced_rate_window', {
            value: model.windowSeconds,
          })}
        >
          {t('event_details.advanced_intake_rate')}
        </SectionLabel>
        <Trace
          values={model.rates}
          domain={model.rateDomain}
          height={TRACK_HEIGHT}
          overlay={
            <>
              <TraceRuleLabel value={DRINKING_RATE_MAX_ML_PER_MIN}>
                {mlPerMin(DRINKING_RATE_MAX_ML_PER_MIN)}
              </TraceRuleLabel>
              {model.peakIntake.index >= 0 && (
                <TraceMarker index={model.peakIntake.index}>
                  {mlPerMin(model.peakIntake.value)}
                </TraceMarker>
              )}
              {model.peakExcluded.index >= 0 && (
                <TraceMarker index={model.peakExcluded.index} tone="alert">
                  {mlPerMin(model.peakExcluded.value)}
                </TraceMarker>
              )}
              <TraceAxis
                start={formatClock(0)}
                end={formatClock(model.durationSeconds)}
              />
            </>
          }
        >
          <TraceBands bands={model.spillBands} />
          <TraceRule value={0} tone="var(--color-border)" dashed={false} />
          <TraceRule value={DRINKING_RATE_MAX_ML_PER_MIN} />
          <TraceArea tone="var(--color-water)" />
          <TraceLine tone="var(--color-water)" strokeWidth={2} />
        </Trace>
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
              value: mlPerMin(model.peakIntake.value),
            },
            {
              key: 'mean-rate',
              label: t('event_details.advanced_mean_rate'),
              value: mlPerMin(model.meanIntake),
            },
            {
              key: 'excluded',
              label: t('event_details.advanced_excluded'),
              value: t('event_details.advanced_millilitres', {
                value: formatNumber(model.excludedMl),
              }),
            },
          ]}
        />
      </section>
    </>
  );
};

export default WaterAdvancedDetails;
