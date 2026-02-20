import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Weight } from 'lucide-react';
import { format } from 'date-fns';
import Timeline from '@/components/ui/Timeline';
import type { EventComponentProps } from './types';
import EventDevice from './meta/EventDevice';
import EventPet from './meta/EventPet';
import EventVerified from './meta/EventVerified';

const WeightEvent: React.FC<EventComponentProps> = ({
  event,
  children,
  onClick,
  showPet = true,
  showDevice = true,
}) => {
  const { t } = useTranslation();
  const { data } = event;

  return (
    <Timeline.Item onClick={onClick}>
      <Timeline.Icon variant="primary">
        <Weight />
      </Timeline.Icon>
      <Timeline.Content>
        <Timeline.Header>
          <Timeline.Timestamp>
            {format(new Date(event.timestamp), 'HH:mm')}
          </Timeline.Timestamp>
          <Timeline.Value variant="primary">{data.weight}g</Timeline.Value>
          <Timeline.Title>{t('overview.weight_recorded')}</Timeline.Title>
        </Timeline.Header>
        <Timeline.Meta>
          {showPet && event.pet_id && <EventPet petId={event.pet_id} />}
          {showDevice && event.device_id && <EventDevice deviceId={event.device_id} />}
          {event.human_verified && <EventVerified />}
          {children}
        </Timeline.Meta>
      </Timeline.Content>
    </Timeline.Item>
  );
};

export default WeightEvent;
