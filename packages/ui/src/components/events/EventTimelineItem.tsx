import * as React from 'react';
import type { EventComponentProps } from './types';
import { resolveTimelineEventComponent } from './eventTimelineRegistry';

const EventTimelineItem: React.FC<EventComponentProps> = (props) => {
  return React.createElement(resolveTimelineEventComponent(props.event), props);
};

export default EventTimelineItem;
