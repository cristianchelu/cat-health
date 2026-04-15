import * as React from 'react';
import { ListChecks } from 'lucide-react';
import Timeline from '@/components/ui/Timeline';
import { useTranslation } from 'react-i18next';

const EventAnnotated: React.FC = () => {
  const { t } = useTranslation();
  return (
    <Timeline.MetaItem>
      <ListChecks />
      {t('overview.annotated')}
    </Timeline.MetaItem>
  );
};

export default EventAnnotated;
