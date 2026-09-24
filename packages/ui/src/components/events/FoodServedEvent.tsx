import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { UtensilsCrossed } from 'lucide-react';
import type { EventComponentProps } from './types';
import EventFood from './meta/EventFood';
import TimelineEventShell from './TimelineEventShell';

/**
 * A bowl's level is quantised to whole grams and its scale drifts, so a bowl
 * reading 1 g before a serving was empty. Above that, food was already there
 * and this was a top-up onto it.
 */
const TOPPED_UP_MIN_LEVEL_G = 1;

const FoodServedEvent: React.FC<EventComponentProps> = (props) => {
  const { t } = useTranslation();
  const { event } = props;
  if (event.data.type !== 'food_served') return null;
  const served = event.data;

  // Which of the two words this is comes from the bowl, not from a field: a
  // feeder that cannot weigh sends no level, and then neither word is earned.
  const toppedUp =
    served.level_before != null && served.level_before > TOPPED_UP_MIN_LEVEL_G;

  return (
    <TimelineEventShell
      {...props}
      icon={<UtensilsCrossed aria-hidden />}
      iconColor="var(--color-food)"
      value={`+${served.amount}g`}
      valueVariant="success"
      title={
        toppedUp ? t('overview.food_topped_up') : t('overview.food_served')
      }
    >
      {served.food_id != null && <EventFood foodId={served.food_id} />}
    </TimelineEventShell>
  );
};

export default FoodServedEvent;
