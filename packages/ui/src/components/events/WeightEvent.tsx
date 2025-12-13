import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Weight } from 'lucide-react';
import { format } from 'date-fns';
import Timeline from '@/components/ui/Timeline';
import type { EventComponentProps } from './types';
import EventPet from './meta/EventPet';
import EventVerified from './meta/EventVerified';

const WeightEvent: React.FC<EventComponentProps> = ({ event, children }) => {
  const { t } = useTranslation();
  const { data } = event;

  return (
    <Timeline.Item>
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
          {event.pet_id && <EventPet petId={event.pet_id} />}
          {event.human_verified && <EventVerified />}
          {children}
        </Timeline.Meta>
      </Timeline.Content>
    </Timeline.Item>
  );
};

export default WeightEvent;
