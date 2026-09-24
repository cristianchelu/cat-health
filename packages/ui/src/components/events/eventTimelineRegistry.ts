import * as React from 'react';
import type { GetEventListItemDTO } from 'shared';
import type { EventComponentProps } from './types';
import LitterboxEvent from './LitterboxEvent';
import WeightEvent from './WeightEvent';
import WaterEvent from './WaterEvent';
import FoodEvent from './FoodEvent';
import FoodServedEvent from './FoodServedEvent';
import DeviceCentricEvent from './DeviceCentricEvent';
import PetPresenceEvent from './PetPresenceEvent';
import GenericEvent from './GenericEvent';

export type TimelineEventComponent = React.ComponentType<EventComponentProps>;

interface TimelineEventRegistration {
  id: string;
  type: string;
  component: TimelineEventComponent;
}

const timelineEventRegistry: TimelineEventRegistration[] = [
  {
    id: 'litterbox-use',
    type: 'litterbox_use',
    component: LitterboxEvent,
  },
  {
    id: 'weight-measurement',
    type: 'weight_measurement',
    component: WeightEvent,
  },
  {
    id: 'water-intake',
    type: 'water_intake',
    component: WaterEvent,
  },
  {
    id: 'food-intake',
    type: 'food_intake',
    component: FoodEvent,
  },
  {
    id: 'food-served',
    type: 'food_served',
    component: FoodServedEvent,
  },
  {
    id: 'device-connectivity',
    type: 'device_connectivity',
    component: DeviceCentricEvent,
  },
  {
    id: 'device-enablement',
    type: 'device_enablement',
    component: DeviceCentricEvent,
  },
  {
    id: 'pet-presence',
    type: 'pet_presence',
    component: PetPresenceEvent,
  },
  {
    id: 'litterbox-maintenance',
    type: 'litterbox_maintenance',
    component: DeviceCentricEvent,
  },
];

const PET_OVERVIEW_HIDDEN_TYPES = new Set([
  'weight_measurement',
  // A serving belongs to the bowl, not to any one pet: it is what the household
  // put out, and every pet with access shares it.
  'food_served',
  'device_connectivity',
  'device_enablement',
  'litterbox_maintenance',
]);

export function resolveTimelineEventComponent(
  event: GetEventListItemDTO,
): TimelineEventComponent {
  const type = event.data?.type;
  if (typeof type === 'string') {
    const registration = timelineEventRegistry.find(
      (entry) => entry.type === type,
    );
    if (registration) {
      return registration.component;
    }
  }

  return GenericEvent;
}

export function isPetOverviewActivityEvent(
  event: GetEventListItemDTO,
): boolean {
  const type = event.data?.type;
  if (typeof type !== 'string') {
    return true;
  }

  return !PET_OVERVIEW_HIDDEN_TYPES.has(type);
}

export function isDeviceTimelineEvent(event: GetEventListItemDTO): boolean {
  const type = event.data?.type;
  if (typeof type !== 'string') {
    return true;
  }

  return type !== 'weight_measurement';
}
