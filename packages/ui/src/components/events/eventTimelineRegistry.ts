import * as React from 'react';
import type { GetEventDTO } from 'shared';
import type { EventComponentProps } from './types';
import LitterboxEvent from './LitterboxEvent';
import WeightEvent from './WeightEvent';
import WaterEvent from './WaterEvent';
import FoodEvent from './FoodEvent';
import DeviceCentricEvent from './DeviceCentricEvent';
import GenericEvent from './GenericEvent';

export type TimelineEventComponent = React.ComponentType<EventComponentProps>;

interface TimelineEventRegistration {
  id: string;
  type: string;
  component: TimelineEventComponent;
}

const timelineEventRegistry: TimelineEventRegistration[] = [
  { id: 'litterbox-use', type: 'litterbox_use', component: LitterboxEvent },
  { id: 'weight-measurement', type: 'weight_measurement', component: WeightEvent },
  { id: 'water-intake', type: 'water_intake', component: WaterEvent },
  { id: 'food-intake', type: 'food_intake', component: FoodEvent },
  {
    id: 'device-connectivity',
    type: 'device_connectivity',
    component: DeviceCentricEvent,
  },
  {
    id: 'litterbox-maintenance',
    type: 'litterbox_maintenance',
    component: DeviceCentricEvent,
  },
];

const PET_OVERVIEW_HIDDEN_TYPES = new Set([
  'weight_measurement',
  'device_connectivity',
  'litterbox_maintenance',
]);

export function resolveTimelineEventComponent(
  event: GetEventDTO,
): TimelineEventComponent {
  const type = event.data?.type;
  if (typeof type === 'string') {
    const registration = timelineEventRegistry.find((entry) => entry.type === type);
    if (registration) {
      return registration.component;
    }
  }

  return GenericEvent;
}

export function isPetOverviewActivityEvent(event: GetEventDTO): boolean {
  const type = event.data?.type;
  if (typeof type !== 'string') {
    return true;
  }

  return !PET_OVERVIEW_HIDDEN_TYPES.has(type);
}

export function isDeviceTimelineEvent(event: GetEventDTO): boolean {
  const type = event.data?.type;
  if (typeof type !== 'string') {
    return true;
  }

  return type !== 'weight_measurement';
}
