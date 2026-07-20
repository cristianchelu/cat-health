import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Drumstick } from 'lucide-react';
import type { EventComponentProps } from './types';
import EventFood from './meta/EventFood';
import TimelineEventShell from './TimelineEventShell';

const FoodEvent: React.FC<EventComponentProps> = (props) => {
  const { t } = useTranslation();
  const { event, children } = props;
  if (event.data.type !== 'food_intake') return null;
  const foodData = event.data;

  const foodId = foodData.food_id;

  return (
    <TimelineEventShell
      {...props}
      icon={<Drumstick aria-hidden />}
      iconVariant="success"
      value={`${foodData.amount}g`}
      valueVariant="success"
      title={t('overview.food_intake')}
    >
      {foodId != null && <EventFood foodId={foodId} />}
      {children}
    </TimelineEventShell>
  );
};

export default FoodEvent;
