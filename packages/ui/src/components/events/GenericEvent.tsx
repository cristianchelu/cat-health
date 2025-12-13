import * as React from 'react';
import { Clock, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import Timeline from '@/components/ui/Timeline';
import type { EventComponentProps } from './types';
import EventDuration from './meta/EventDuration';
import EventPet from './meta/EventPet';
import EventVerified from './meta/EventVerified';

const GenericEvent: React.FC<EventComponentProps> = ({ event, children }) => {
  const { data } = event;
  const hasType = data && data.type;

  return (
    <Timeline.Item>
      <Timeline.Icon>{hasType ? <Clock /> : <AlertTriangle />}</Timeline.Icon>
      <Timeline.Content>
        <Timeline.Header>
          <Timeline.Timestamp>
            {format(new Date(event.timestamp), 'HH:mm')}
          </Timeline.Timestamp>
          <Timeline.Title>
            {hasType ? data.type : 'Unknown Event'}
          </Timeline.Title>
        </Timeline.Header>
        <Timeline.Meta>
          {data?.duration && <EventDuration duration={data.duration} />}
          {event.pet_id && <EventPet petId={event.pet_id} />}
          {event.human_verified && <EventVerified />}
          {children}
        </Timeline.Meta>
      </Timeline.Content>
    </Timeline.Item>
  );
};

export default GenericEvent;
