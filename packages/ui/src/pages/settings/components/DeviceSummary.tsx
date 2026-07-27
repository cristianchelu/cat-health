import * as React from 'react';
import { useTranslation } from 'react-i18next';
import './DeviceSummary.css';

interface DeviceSummaryProps {
  externalId: string;
}

/**
 * The raw provider-side facts about a device that no field edits.
 *
 * The device type used to sit here too; it now reads off the form card header,
 * which names the device, its type and where it came from.
 */
export const DeviceSummary: React.FC<DeviceSummaryProps> = ({ externalId }) => {
  const { t } = useTranslation();
  return (
    <div className="device-summary">
      <div className="summary-item">
        <span className="label">{t('settings.external_id_label')}</span>
        <span className="value">{externalId}</span>
      </div>
    </div>
  );
};
