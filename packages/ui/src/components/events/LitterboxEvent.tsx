import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Droplets, Gift, Toilet } from 'lucide-react';
import { format } from 'date-fns';
import Timeline from '@/components/ui/Timeline';
import type { EventComponentProps } from './types';
import EventDevice from './meta/EventDevice';
import EventDuration from './meta/EventDuration';
import EventPet from './meta/EventPet';
import EventVerified from './meta/EventVerified';
import PoopIcon from '../icons/PoopIcon';
import type { LitterboxUseEliminationType } from 'shared';

const ICON_MAP: Record<LitterboxUseEliminationType, React.ElementType> = {
  urination: Droplets,
  defecation: PoopIcon,
  both: Gift,
  no_elimination: Toilet,
  unknown: Toilet,
};

const COLOR_MAP: Record<LitterboxUseEliminationType, string> = {
  urination: '#FFA500',
  defecation: '#8B4513',
  both: 'var(--color-warning)',
  no_elimination: 'var(--color-text-muted)',
  unknown: 'var(--color-text-muted)',
};

const LitterboxEvent: React.FC<EventComponentProps> = ({
  event,
  children,
  onClick,
  showPet = true,
  showDevice = true,
}) => {
  const { t } = useTranslation();
  const { data } = event;

  const eliminationType = data.elimination_type as LitterboxUseEliminationType;

  const variant = React.useMemo(() => {
    if (data.straining) return 'danger';
    if (eliminationType === 'no_elimination') return 'default';
    return 'warning';
  }, [eliminationType, data.straining]);

  const title = React.useMemo(() => {
    switch (eliminationType) {
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
  }, [eliminationType, t]);

  const Icon = ICON_MAP[eliminationType] || Toilet;
  const style = {
    '--timeline-icon-color': COLOR_MAP[eliminationType],
  } as React.CSSProperties;

  return (
    <Timeline.Item onClick={onClick} style={style}>
      <Timeline.Icon variant={variant}>
        <Icon />
      </Timeline.Icon>
      <Timeline.Content>
        <Timeline.Header>
          <Timeline.Timestamp>
            {format(new Date(event.timestamp), 'HH:mm')}
          </Timeline.Timestamp>
          {data.elimination_weight !== undefined && (
            <Timeline.Value
              variant={variant}
              style={eliminationType === 'no_elimination' ? { color: 'var(--color-text-muted)' } : undefined}
            >
              {data.elimination_weight}g
            </Timeline.Value>
          )}
          <Timeline.Title>{title}</Timeline.Title>
        </Timeline.Header>
        <Timeline.Meta>
          {data.duration && <EventDuration duration={data.duration} />}
          {showPet && event.pet_id && <EventPet petId={event.pet_id} />}
          {showDevice && event.device_id && <EventDevice deviceId={event.device_id} />}
          {event.human_verified && <EventVerified />}
          {data.straining && (
            <Timeline.Badge variant="warning">
              {t('overview.straining_detected')}
            </Timeline.Badge>
          )}
          {children}
        </Timeline.Meta>
      </Timeline.Content>
    </Timeline.Item>
  );
};

export default LitterboxEvent;
