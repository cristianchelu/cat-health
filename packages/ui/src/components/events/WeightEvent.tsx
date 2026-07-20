import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Weight } from 'lucide-react';
import Timeline from '@/components/ui/Timeline';
import type { EventComponentProps } from './types';
import { useFormatters } from '@/contexts/RegionalPreferencesProvider';
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
  const { formatTime } = useFormatters();
  if (event.data.type !== 'weight_measurement') return null;
  const weightData = event.data;

  return (
    <Timeline.Item onClick={onClick}>
      <Timeline.Icon variant="primary">
        <Weight />
      </Timeline.Icon>
      <Timeline.Content>
        <Timeline.Header>
          <Timeline.Timestamp>
            {formatTime(new Date(event.timestamp))}
          </Timeline.Timestamp>
          <Timeline.Value variant="primary">
            {weightData.weight}g
          </Timeline.Value>
          <Timeline.TitleGroup>
            {event.human_verified && <EventVerified />}
            <Timeline.Title>{t('overview.weight_recorded')}</Timeline.Title>
          </Timeline.TitleGroup>
        </Timeline.Header>
        <Timeline.Meta>
          {showPet && event.pet_id && <EventPet petId={event.pet_id} />}
          {showDevice && event.device_id && (
            <EventDevice deviceId={event.device_id} />
          )}
          {children}
        </Timeline.Meta>
      </Timeline.Content>
    </Timeline.Item>
  );
};

export default WeightEvent;
