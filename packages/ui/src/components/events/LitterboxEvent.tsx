import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Toilet } from 'lucide-react';
import { format } from 'date-fns';
import Timeline from '@/components/ui/Timeline';
import type { EventComponentProps } from './types';
import EventDuration from './meta/EventDuration';
import EventPet from './meta/EventPet';
import EventVerified from './meta/EventVerified';

const LitterboxEvent: React.FC<EventComponentProps> = ({
  event,
  children,
  onClick,
}) => {
  const { t } = useTranslation();
  const { data } = event;

  const variant = React.useMemo(() => {
    if (data.elimination_type === 'no_elimination') return 'danger';
    return 'warning';
  }, [data.elimination_type]);

  const title = React.useMemo(() => {
    switch (data.elimination_type) {
      case 'urination':
        return t('overview.urination');
      case 'defecation':
        return t('overview.defecation');
      case 'both':
        return t('overview.elimination');
      case 'no_elimination':
        return t('overview.no_elimination');
      default:
        return t('overview.litterbox_visit');
    }
  }, [data.elimination_type, t]);

  return (
    <Timeline.Item
      onClick={onClick}
      variant={variant === 'danger' ? 'warning' : 'default'}
    >
      <Timeline.Icon variant={variant}>
        <Toilet />
      </Timeline.Icon>
      <Timeline.Content>
        <Timeline.Header>
          <Timeline.Timestamp>
            {format(new Date(event.timestamp), 'HH:mm')}
          </Timeline.Timestamp>
          {data.elimination_weight !== undefined && (
            <Timeline.Value variant={variant}>
              {data.elimination_weight}g
            </Timeline.Value>
          )}
          <Timeline.Title>{title}</Timeline.Title>
        </Timeline.Header>
        <Timeline.Meta>
          {data.duration && <EventDuration duration={data.duration} />}
          {event.pet_id && <EventPet petId={event.pet_id} />}
          {event.human_verified && <EventVerified />}
          {children}
        </Timeline.Meta>
        {data.elimination_type === 'no_elimination' && (
          <Timeline.Footer>
            <Timeline.Badge variant="warning">
              {t('overview.straining_detected')}
            </Timeline.Badge>
          </Timeline.Footer>
        )}
      </Timeline.Content>
    </Timeline.Item>
  );
};

export default LitterboxEvent;
