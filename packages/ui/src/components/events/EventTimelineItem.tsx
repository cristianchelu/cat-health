import * as React from 'react';
import type { EventComponentProps } from './types';
import { resolveTimelineEventComponent } from './eventTimelineRegistry';

const EventTimelineItem: React.FC<EventComponentProps> = (props) => {
  const Component = resolveTimelineEventComponent(props.event);
  return <Component {...props} />;
};

export default EventTimelineItem;
