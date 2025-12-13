import * as React from 'react';
import { CheckCircle } from 'lucide-react';
import Timeline from '@/components/ui/Timeline';
import { useTranslation } from 'react-i18next';

const EventVerified: React.FC = () => {
  const { t } = useTranslation();
  return (
    <Timeline.MetaItem>
      <CheckCircle />
      {t('overview.verified')}
    </Timeline.MetaItem>
  );
};

export default EventVerified;
