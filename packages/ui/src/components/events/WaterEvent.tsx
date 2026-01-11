import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { GlassWater } from 'lucide-react';
import { format } from 'date-fns';
import Timeline from '@/components/ui/Timeline';
import type { EventComponentProps } from './types';
import EventDuration from './meta/EventDuration';
import EventPet from './meta/EventPet';
import EventVerified from './meta/EventVerified';

const WaterEvent: React.FC<EventComponentProps> = ({
  event,
  children,
  onClick,
}) => {
  const { t } = useTranslation();
  const { data } = event;

  return (
    <Timeline.Item
      onClick={onClick}
      style={
        {
          '--timeline-icon-color': 'var(--color-primary)',
        } as React.CSSProperties
      }
    >
      <Timeline.Icon variant="primary">
        <GlassWater />
      </Timeline.Icon>
      <Timeline.Content>
        <Timeline.Header>
          <Timeline.Timestamp>
            {format(new Date(event.timestamp), 'HH:mm')}
          </Timeline.Timestamp>
          <Timeline.Value variant="primary">{data.amount}ml</Timeline.Value>
          <Timeline.Title>{t('overview.water_intake')}</Timeline.Title>
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

export default WaterEvent;
