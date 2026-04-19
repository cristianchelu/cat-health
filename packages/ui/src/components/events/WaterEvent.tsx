import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { DropletOff, GlassWater } from 'lucide-react';
import { format } from 'date-fns';
import Timeline from '@/components/ui/Timeline';
import type { EventComponentProps } from './types';
import EventDevice from './meta/EventDevice';
import EventDuration from './meta/EventDuration';
import EventPet from './meta/EventPet';
import EventVerified from './meta/EventVerified';
const WaterEvent: React.FC<EventComponentProps> = ({
  event,
  children,
  onClick,
  showPet = true,
  showDevice = true,
}) => {
  const { t } = useTranslation();
  const { data } = event;

  const excludedAmount: number | undefined =
    typeof data.excluded_amount === 'number' ? data.excluded_amount : undefined;
  const hasFiltered = data.filtered === true && excludedAmount != null && excludedAmount > 0;

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
          {data.duration !== null && <EventDuration duration={data.duration} />}
          {hasFiltered && (
            <Timeline.MetaItem title={t('overview.water_spill_excluded', { amount: excludedAmount })}>
              <DropletOff aria-hidden />
              {excludedAmount}ml
            </Timeline.MetaItem>
          )}
          {showPet && event.pet_id && <EventPet petId={event.pet_id} />}
          {showDevice && event.device_id && <EventDevice deviceId={event.device_id} />}
          {event.human_verified && <EventVerified />}
          {children}
        </Timeline.Meta>
      </Timeline.Content>
    </Timeline.Item>
  );
};

export default WaterEvent;
