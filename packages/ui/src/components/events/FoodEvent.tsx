import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Drumstick } from 'lucide-react';
import { format } from 'date-fns';
import Timeline from '@/components/ui/Timeline';
import type { EventComponentProps } from './types';
import EventDuration from './meta/EventDuration';
import EventPet from './meta/EventPet';
import EventVerified from './meta/EventVerified';

const FoodEvent: React.FC<EventComponentProps> = ({ event, children }) => {
  const { t } = useTranslation();
  const { data } = event;

  return (
    <Timeline.Item>
      <Timeline.Icon variant="success">
        <Drumstick />
      </Timeline.Icon>
      <Timeline.Content>
        <Timeline.Header>
          <Timeline.Timestamp>
            {format(new Date(event.timestamp), 'HH:mm')}
          </Timeline.Timestamp>
          <Timeline.Value variant="success">{data.amount}g</Timeline.Value>
          <Timeline.Title>{t('overview.food_intake')}</Timeline.Title>
        </Timeline.Header>
        <Timeline.Meta>
          {data.duration && <EventDuration duration={data.duration} />}
          {event.pet_id && <EventPet petId={event.pet_id} />}
          {event.human_verified && <EventVerified />}
          {children}
        </Timeline.Meta>
      </Timeline.Content>
    </Timeline.Item>
  );
};

export default FoodEvent;
