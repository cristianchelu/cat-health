import type { IntakeGap } from 'shared';

import type { TranslationKey } from '@/lib/translationKey';

/** What to say when a preset has no band. */
export const GAP_KEYS: Record<IntakeGap, TranslationKey> = {
  needs_target_weight: 'health.dietary_needs.gap_needs_target_weight',
  not_in_source: 'health.dietary_needs.gap_not_in_source',
};
