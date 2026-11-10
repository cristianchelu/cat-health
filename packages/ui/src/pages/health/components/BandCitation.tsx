import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  NUTRITION_SOURCES,
  type BandAdjustment,
  type NutritionSourceId,
} from 'shared';

import type { TranslationKey } from '@/lib/translationKey';

import { BandSourceHint } from './BandSourceHint';

/** What to add to a band's source when the app changed its numbers. */
const ADJUSTMENT_KEYS: Record<BandAdjustment, TranslationKey> = {
  point_tolerance: 'health.dietary_needs.source_hint_point_tolerance',
  floor: 'health.dietary_needs.source_hint_floor',
};

interface BandCitationProps {
  sourceId: NutritionSourceId;
  /** The model row's `ref`. */
  reference: string;
  adjustments: readonly BandAdjustment[];
}

/** The source hint for a preset band: looks the source up and words what the app changed. */
const BandCitation: React.FC<BandCitationProps> = ({
  sourceId,
  reference,
  adjustments,
}) => {
  const { t } = useTranslation();
  const source = NUTRITION_SOURCES[sourceId];
  return (
    <BandSourceHint
      label={t('health.dietary_needs.source_hint_label')}
      source={source.label}
      reference={reference}
      notes={adjustments.map((adjustment) => t(ADJUSTMENT_KEYS[adjustment]))}
      href={source.url}
      linkLabel={t('health.dietary_needs.source_hint_link')}
    />
  );
};

export { BandCitation, type BandCitationProps };
