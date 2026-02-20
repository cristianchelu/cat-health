import * as React from 'react';
import { Clock, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import Timeline from '@/components/ui/Timeline';
import type { EventComponentProps } from './types';
import EventDevice from './meta/EventDevice';
import EventDuration from './meta/EventDuration';
import EventPet from './meta/EventPet';
import EventVerified from './meta/EventVerified';

const GenericEvent: React.FC<EventComponentProps> = ({
  event,
  children,
  onClick,
  showPet = true,
  showDevice = true,
}) => {
  const { data } = event;
  const hasType = data && data.type;

  return (
    <Timeline.Item onClick={onClick}>
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
          {showPet && event.pet_id && <EventPet petId={event.pet_id} />}
          {showDevice && event.device_id && <EventDevice deviceId={event.device_id} />}
          {event.human_verified && <EventVerified />}
          {children}
        </Timeline.Meta>
      </Timeline.Content>
    </Timeline.Item>
  );
};

export default GenericEvent;
