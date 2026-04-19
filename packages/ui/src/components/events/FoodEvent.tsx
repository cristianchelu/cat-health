import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Drumstick } from 'lucide-react';
import { format } from 'date-fns';
import Timeline from '@/components/ui/Timeline';
import type { EventComponentProps } from './types';
import EventDevice from './meta/EventDevice';
import EventDuration from './meta/EventDuration';
import EventFood from './meta/EventFood';
import EventPet from './meta/EventPet';
import EventVerified from './meta/EventVerified';

const FoodEvent: React.FC<EventComponentProps> = ({
  event,
  children,
  onClick,
  showPet = true,
  showDevice = true,
}) => {
  const { t } = useTranslation();
  const { data } = event;
  const foodId =
    typeof (data as { food_id?: unknown }).food_id === 'number'
      ? (data as { food_id: number }).food_id
      : undefined;

  return (
    <Timeline.Item onClick={onClick}>
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
          {foodId != null && <EventFood foodId={foodId} />}
          {showPet && event.pet_id && <EventPet petId={event.pet_id} />}
          {showDevice && event.device_id && <EventDevice deviceId={event.device_id} />}
          {event.human_verified && <EventVerified />}
          {children}
        </Timeline.Meta>
      </Timeline.Content>
    </Timeline.Item>
  );
};

export default FoodEvent;
