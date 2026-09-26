import type { EventType } from 'shared';

import type en from '@/locales/en.json';

type EventDetailsKey = `event_details.${keyof typeof en.event_details}`;

/**
 * The name of each kind of event. Keyed by the full `EventType` union and
 * typed against `en.json`, so a new event type without a title, or a title
 * missing from the base locale, fails the build instead of rendering the key.
 */
export const EVENT_TITLE_KEYS: Record<EventType, EventDetailsKey> = {
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
