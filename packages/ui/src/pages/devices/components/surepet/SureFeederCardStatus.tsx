import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  parseWithSchema,
  SurePetDeviceStateSchema,
  type GetDeviceResponseDTO,
} from 'shared';
import SureFeederStatus from '../SureFeederStatus';

interface SureFeederCardStatusProps {
  device: GetDeviceResponseDTO;
}

const SureFeederCardStatus: React.FC<SureFeederCardStatusProps> = ({
  device,
}) => {
  const { t } = useTranslation();
  const state = parseWithSchema(SurePetDeviceStateSchema, device.state);

  if (!state) {
    return <div className="no-status-data">{t('devices.no_status_data')}</div>;
  }

  return <SureFeederStatus state={state} />;
};

export default SureFeederCardStatus;
