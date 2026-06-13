import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Drumstick } from 'lucide-react';
import type { EventComponentProps } from './types';
import EventDuration from './meta/EventDuration';
import EventFood from './meta/EventFood';
import TimelineEventShell from './TimelineEventShell';

const FoodEvent: React.FC<EventComponentProps> = (props) => {
  const { t } = useTranslation();
  const { event, children } = props;
  const { data } = event;
  const foodId =
    typeof (data as { food_id?: unknown }).food_id === 'number'
      ? (data as { food_id: number }).food_id
      : undefined;

  return (
    <TimelineEventShell
      {...props}
      icon={<Drumstick aria-hidden />}
      iconVariant="success"
      value={`${data.amount}g`}
      valueVariant="success"
      title={t('overview.food_intake')}
    >
      {data.duration && <EventDuration duration={data.duration} />}
      {foodId != null && <EventFood foodId={foodId} />}
      {children}
    </TimelineEventShell>
  );
};

export default FoodEvent;
