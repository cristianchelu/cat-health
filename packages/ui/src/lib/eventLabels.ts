import type { EventType, LitterboxUseEliminationType } from 'shared';

import type { TranslationKey } from '@/lib/translationKey';

/**
 * The name of each kind of event. Keyed by the full `EventType` union, so a new
 * event type without a title fails the build instead of rendering the key.
 */
export const EVENT_TITLE_KEYS: Record<EventType, TranslationKey> = {
  weight_measurement: 'event_details.title_weight_measurement',
  water_intake: 'event_details.title_water_intake',
  litterbox_use: 'event_details.title_litterbox_use',
  food_intake: 'event_details.title_food_intake',
  food_served: 'event_details.title_food_served',
  litterbox_maintenance: 'event_details.title_litterbox_maintenance',
  device_connectivity: 'event_details.title_device_connectivity',
  device_enablement: 'event_details.title_device_enablement',
  pet_presence: 'event_details.title_pet_presence',
};

/** What a litterbox visit left behind, as a label. */
export const ELIMINATION_LABEL_KEYS: Record<
  LitterboxUseEliminationType,
  TranslationKey
> = {
  urination: 'overview.urination',
  defecation: 'overview.defecation',
  both: 'overview.both',
  no_elimination: 'overview.no_elimination',
  unknown: 'common.unknown',
};
