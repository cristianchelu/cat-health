import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { LitterboxUseEventDataDTO } from 'shared';

import { ChartLegend } from '@/components/charts/ChartLegend';
import { Trace } from '@/components/charts/Trace';
import { TraceBands, TraceLine } from '@/components/charts/TraceLayers';
import { ReadoutGrid } from '@/components/ui/ReadoutGrid';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { useFormatters } from '@/contexts/RegionalPreferencesProvider';

import type { DecodedLitterboxRawData } from './decodeLitterboxRawData';
import { formatSigmaG } from './litterboxPeriodStats';
import { formatClock } from './advancedDetailsFormat';
import {
  buildLitterboxAdvancedModel,
  ELIMINATION_LABEL_KEYS,
  LITTERBOX_STATE_COLORS,
  LITTERBOX_STATE_LABEL_KEYS,
} from './litterboxAdvancedModel';
import { SegmentTable, type SegmentTableRow } from './SegmentTable';

export interface LitterboxAdvancedDetailsProps {
  data: LitterboxUseEventDataDTO;
  decoded: DecodedLitterboxRawData;
}

/**
 * A visit as the load cell saw it: the trace, and the analyzer's sections.
 *
 * The container half — it turns the model's numbers into words and hands them
 * to the views. The table is the payoff: σ is what the device thresholds to
 * tell urination from defecation, so the eliminating row carries both the
 * number and the verdict it produced.
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

  const model = React.useMemo(
    () => buildLitterboxAdvancedModel(data, decoded),
    [data, decoded],
  );

  const sigmaGrams = (value: number | null) =>
    value == null
      ? '—'
      : t('event_details.advanced_grams', { value: formatSigmaG(value) });
  const wholeGrams = (value: number | null) =>
    value == null
      ? '—'
      : t('event_details.advanced_grams', {
          value: formatNumber(Math.round(value)),
        });

  const rows: SegmentTableRow[] = model.sections.map((section) => ({
    key: section.key,
    color: section.color,
    name: t(
      LITTERBOX_STATE_LABEL_KEYS[section.state] ??
        'event_details.advanced_section',
    ),
    note:
      section.eliminationType == null
        ? undefined
        : t('event_details.advanced_classified_as', {
            value: t(ELIMINATION_LABEL_KEYS[section.eliminationType]),
          }),
    length: formatClock(section.lengthSeconds),
    spread: sigmaGrams(section.sigma),
  }));

  return (
    <>
      <section className="event-advanced-section">
        <SectionLabel
          aside={[
            t('event_details.advanced_samples', {
              value: formatNumber(model.weights.length),
            }),
            t('event_details.advanced_sample_rate', {
              value: model.sampleRateHz.toFixed(1),
            }),
          ].join(' · ')}
        >
          {t('event_details.advanced_weight_signal')}
        </SectionLabel>
        <Trace values={model.weights}>
          <TraceBands bands={model.bands} />
          <TraceLine />
        </Trace>
        <ChartLegend
          variant="inline"
          items={Object.keys(LITTERBOX_STATE_COLORS).map((state) => ({
            tone: LITTERBOX_STATE_COLORS[state],
            label: t(LITTERBOX_STATE_LABEL_KEYS[state]),
          }))}
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
              value: wholeGrams(model.startWeight),
            },
            {
              key: 'end-weight',
              label: t('event_details.advanced_end_weight'),
              value: wholeGrams(model.endWeight),
            },
          ]}
        />
      </section>

      {rows.length > 0 && (
        <section className="event-advanced-section">
          <SectionLabel>
            {t('event_details.advanced_detected_sections')}
          </SectionLabel>
          <SegmentTable
            columns={{
              name: t('event_details.advanced_section'),
              length: t('event_details.advanced_length'),
              spread: t('event_details.advanced_sigma_load'),
            }}
            rows={rows}
          />
        </section>
      )}
    </>
  );
};

export default LitterboxAdvancedDetails;
