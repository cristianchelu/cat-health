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
  const { data } = event;

  const excludedAmount: number | undefined =
    typeof data.excluded_amount === 'number' ? data.excluded_amount : undefined;
  const hasFiltered =
    data.filtered === true && excludedAmount != null && excludedAmount > 0;

  return (
    <TimelineEventShell
      {...props}
      icon={<GlassWater aria-hidden />}
      iconVariant="primary"
      value={`${data.amount}ml`}
      valueVariant="primary"
      title={t('overview.water_intake')}
      itemStyle={
        {
          '--timeline-icon-color': 'var(--color-primary)',
        } as React.CSSProperties
      }
    >
      {typeof data.duration === 'number' && (
        <EventDuration duration={data.duration} />
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
