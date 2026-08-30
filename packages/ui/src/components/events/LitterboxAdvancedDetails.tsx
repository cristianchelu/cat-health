import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  deriveLitterboxSampleRateHz,
  type LitterboxAnalysisStatePeriod,
  type LitterboxUseEventDataDTO,
} from 'shared';

import { ChartLegend } from '@/components/charts/ChartLegend';
import { Trace } from '@/components/charts/Trace';
import {
  TraceBands,
  TraceLine,
  type TraceBand,
} from '@/components/charts/TraceLayers';
import { ReadoutGrid } from '@/components/ui/ReadoutGrid';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { useFormatters } from '@/contexts/RegionalPreferencesProvider';

import type { DecodedLitterboxRawData } from './decodeLitterboxRawData';
import { formatSigmaG, trimmedSliceMeanSigma } from './litterboxPeriodStats';
import { formatClock } from './advancedDetailsFormat';

/** The shipped palette; the same four names the analyzer emits. */
const STATE_COLORS: Record<string, string> = {
  entering: 'var(--color-signal-entering)',
  occupied: 'var(--color-signal-occupied)',
  eliminating: 'var(--color-signal-eliminating)',
  gap: 'var(--color-signal-gap)',
};

const STATE_LABEL_KEYS: Record<string, string> = {
  entering: 'event_details.legend_entering',
  occupied: 'event_details.legend_occupied',
  eliminating: 'event_details.legend_eliminating',
  gap: 'event_details.legend_gap',
};

const ELIMINATION_LABEL_KEYS: Record<string, string> = {
  urination: 'overview.urination',
  defecation: 'overview.defecation',
};

export interface LitterboxAdvancedDetailsProps {
  data: LitterboxUseEventDataDTO;
  decoded: DecodedLitterboxRawData;
}

/**
 * A visit as the load cell saw it: the trace, and the analyzer's sections.
 *
 * The table is the payoff. σ is what the device thresholds to tell urination
 * from defecation, so the eliminating row carries both the number and the
 * verdict it produced — the arrow is the classifier's answer written next to
 * its input.
 *
 * The threshold itself is deliberately not drawn. It lives on the API's
 * `StateAnalyzer` as a per-device setting that never reaches the event, so any
 * line the UI drew here would be a second copy of a number it cannot read.
 * When the device's configured threshold is on the DTO, this is where it goes.
 */
const LitterboxAdvancedDetails: React.FC<LitterboxAdvancedDetailsProps> = ({
  data,
  decoded,
}) => {
  const { t } = useTranslation();
  const { formatNumber } = useFormatters();

  const weights = decoded.weights;
  /* v2 blobs carry per-sample offsets, so the real rate is ~7.3 Hz on the
     hardware rather than the nominal 10 the legacy path assumed. */
  const sampleRateHz = deriveLitterboxSampleRateHz(decoded, data.duration);
  /* Stable across renders so the bands below are not rebuilt on every one —
     an absent `segments` is a fresh literal each time otherwise. */
  const segments = React.useMemo<LitterboxAnalysisStatePeriod[]>(
    () => data.segments ?? [],
    [data.segments],
  );

  const bands = React.useMemo<TraceBand[]>(
    () =>
      segments.map((segment, i) => ({
        key: `${segment.state}-${i}`,
        start: segment.start,
        end: segment.end,
        color: STATE_COLORS[segment.state] ?? 'transparent',
      })),
    [segments],
  );

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
            t('event_details.advanced_sample_rate', {
              value: sampleRateHz.toFixed(1),
            }),
          ].join(' · ')}
        >
          {t('event_details.advanced_weight_signal')}
        </SectionLabel>
        <Trace values={weights}>
          <TraceBands bands={bands} />
          <TraceLine />
        </Trace>
        <ChartLegend
          variant="inline"
          items={Object.keys(STATE_COLORS).map((state) => ({
            tone: STATE_COLORS[state],
            label: t(STATE_LABEL_KEYS[state]),
          }))}
        />
        <ReadoutGrid
          readouts={[
            {
              key: 'length',
              label: t('event_details.advanced_length'),
              value: formatClock(data.duration),
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

      {segments.length > 0 && (
        <section className="event-advanced-section">
          <SectionLabel>
            {t('event_details.advanced_detected_sections')}
          </SectionLabel>
          {/*
           * A real table: four columns of one kind of thing each, which is
           * what a screen reader needs to read the σ back against the section
           * it belongs to. Only this page has one, so its skin stays here.
           */}
          <table className="segment-table">
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">
                    {t('event_details.advanced_section')}
                  </span>
                </th>
                <th scope="col">{t('event_details.advanced_section')}</th>
                <th scope="col">{t('event_details.advanced_length')}</th>
                <th scope="col">{t('event_details.advanced_sigma_load')}</th>
              </tr>
            </thead>
            <tbody>
              {segments.map((segment, i) => {
                const stats = trimmedSliceMeanSigma(
                  weights,
                  segment.start,
                  segment.end,
                );
                const eliminationKey =
                  segment.elimination_type == null
                    ? null
                    : ELIMINATION_LABEL_KEYS[segment.elimination_type];
                return (
                  <tr key={`${segment.state}-${i}`}>
                    <td>
                      <span
                        className="segment-table-swatch"
                        style={{
                          background:
                            STATE_COLORS[segment.state] ?? 'transparent',
                        }}
                        aria-hidden="true"
                      />
                    </td>
                    <th scope="row">
                      {t(
                        STATE_LABEL_KEYS[segment.state] ??
                          'event_details.advanced_section',
                      )}
                      {eliminationKey != null && (
                        <small>
                          {t('event_details.advanced_classified_as', {
                            value: t(eliminationKey),
                          })}
                        </small>
                      )}
                    </th>
                    <td className="segment-table-number">
                      {formatClock(
                        (segment.end - segment.start) / sampleRateHz,
                      )}
                    </td>
                    <td className="segment-table-number quiet">
                      {stats == null
                        ? '—'
                        : t('event_details.advanced_grams', {
                            value: formatSigmaG(stats.sigma),
                          })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
};

export default LitterboxAdvancedDetails;
