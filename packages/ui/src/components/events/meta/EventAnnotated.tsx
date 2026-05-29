import * as React from 'react';
import { ListChecks } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const EventAnnotated: React.FC = () => {
  const { t } = useTranslation();
  const label = t('overview.annotated');

  return (
    <span
      className="timeline-title-badge timeline-title-badge-annotated"
      title={label}
      aria-label={label}
    >
      <ListChecks aria-hidden />
    </span>
  );
};

export default EventAnnotated;
