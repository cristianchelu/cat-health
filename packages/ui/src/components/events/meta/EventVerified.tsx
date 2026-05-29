import * as React from 'react';
import { BadgeCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const EventVerified: React.FC = () => {
  const { t } = useTranslation();
  const label = t('overview.verified');

  return (
    <span
      className="timeline-title-badge timeline-title-badge-verified"
      title={label}
      aria-label={label}
    >
      <BadgeCheck aria-hidden />
    </span>
  );
};

export default EventVerified;
