import * as React from 'react';
import { Clock, AlertTriangle } from 'lucide-react';
import Timeline from '@/components/ui/Timeline';
import { getStringValue, isRecord } from '@/lib/utils';
import type { EventComponentProps } from './types';
import { useFormatters } from '@/contexts/RegionalPreferencesProvider';
import EventDevice from './meta/EventDevice';
import EventPet from './meta/EventPet';
import EventVerified from './meta/EventVerified';

const GenericEvent: React.FC<EventComponentProps> = ({
  event,
  children,
  onClick,
  showPet = true,
  showDevice = true,
}) => {
  const { formatTime } = useFormatters();
  const { data } = event;
  const type = isRecord(data) ? getStringValue(data, 'type') : undefined;

  return (
    <Timeline.Item onClick={onClick}>
      <Timeline.Icon>{type ? <Clock /> : <AlertTriangle />}</Timeline.Icon>
      <Timeline.Content>
        <Timeline.Header>
          <Timeline.Timestamp>
            {formatTime(new Date(event.timestamp))}
          </Timeline.Timestamp>
          <Timeline.TitleGroup>
            {event.human_verified && <EventVerified />}
            <Timeline.Title>{type ?? 'Unknown Event'}</Timeline.Title>
          </Timeline.TitleGroup>
        </Timeline.Header>
        <Timeline.Meta>
          {showPet && (
            <EventPet petId={event.pet_id} causedBy={event.caused_by} />
          )}
          {showDevice && event.device_id && (
            <EventDevice deviceId={event.device_id} />
          )}
          {children}
        </Timeline.Meta>
      </Timeline.Content>
    </Timeline.Item>
  );
};

export default GenericEvent;
