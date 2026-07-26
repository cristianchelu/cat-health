import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { DeviceType } from 'shared';

interface DeviceSummaryProps {
  type: DeviceType;
  externalId: string;
}

export const DeviceSummary: React.FC<DeviceSummaryProps> = ({
  type,
  externalId,
}) => {
  const { t } = useTranslation();
  return (
    <div className="device-summary">
      <div className="summary-item">
        <span className="label">{t('settings.type_label')}</span>
        <span className="value">{t(`device_types.${type}`)}</span>
      </div>
      <div className="summary-item">
        <span className="label">{t('settings.external_id_label')}</span>
        <span className="value">{externalId}</span>
      </div>
    </div>
  );
};
