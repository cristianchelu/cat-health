import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { DropletOff, GlassWater } from 'lucide-react';
import Timeline from '@/components/ui/Timeline';
import type { EventComponentProps } from './types';
import EventDuration from './meta/EventDuration';
import TimelineEventShell from './TimelineEventShell';

const WaterEvent: React.FC<EventComponentProps> = (props) => {
  const { t } = useTranslation();
  const { event, children } = props;
  if (event.data.type !== 'water_intake') return null;
  const waterData = event.data;

  const excludedAmount = waterData.excluded_amount;
  const hasFiltered =
    waterData.filtered === true && excludedAmount != null && excludedAmount > 0;

  return (
    <TimelineEventShell
      {...props}
      icon={<GlassWater aria-hidden />}
      iconVariant="primary"
      value={`${waterData.amount}ml`}
      valueVariant="primary"
      title={t('overview.water_intake')}
      itemStyle={
        {
          '--timeline-icon-color': 'var(--color-primary)',
        } as React.CSSProperties
      }
    >
      {typeof waterData.duration === 'number' && (
        <EventDuration duration={waterData.duration} />
      )}
      {hasFiltered && (
        <Timeline.MetaItem
          title={t('overview.water_spill_excluded', { amount: excludedAmount })}
        >
          <DropletOff aria-hidden />
          {excludedAmount}ml
        </Timeline.MetaItem>
      )}
      {children}
    </TimelineEventShell>
  );
};

export default WaterEvent;
