import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Weight } from 'lucide-react';
import type { EventComponentProps } from './types';
import TimelineEventShell from './TimelineEventShell';

const WeightEvent: React.FC<EventComponentProps> = (props) => {
  const { t } = useTranslation();
  if (props.event.data.type !== 'weight_measurement') return null;
  const weightData = props.event.data;

  return (
    <TimelineEventShell
      {...props}
      icon={<Weight aria-hidden />}
      iconColor="var(--color-primary)"
      value={`${weightData.weight}g`}
      valueVariant="primary"
      title={t('overview.weight_recorded')}
    />
  );
};

export default WeightEvent;
