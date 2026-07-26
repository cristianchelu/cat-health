import * as React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormField, Select } from '@/components/ui/form';
import type { DeviceType } from 'shared';
import { EsphomeLitterboxForm } from './esphome/EsphomeLitterboxForm';
import { EsphomeWaterFountainForm } from './esphome/EsphomeWaterFountainForm';
import type { RegisterDeviceFormProps } from './types';

type EsphomeDeviceType = Extract<DeviceType, 'litterbox' | 'water_fountain'>;

const ESPHOME_DEFAULT_TYPE: EsphomeDeviceType = 'litterbox';

function isEsphomeType(type: DeviceType): type is EsphomeDeviceType {
  return type === 'litterbox' || type === 'water_fountain';
}

export const EsphomeRegisterDeviceForm: React.FC<RegisterDeviceFormProps> = (
  props,
) => {
  const { t } = useTranslation();
  const [directType, setDirectType] = useState<EsphomeDeviceType>(
    ESPHOME_DEFAULT_TYPE,
  );

  const prefillType =
    props.prefill && isEsphomeType(props.prefill.type)
      ? props.prefill.type
      : null;
  const deviceType: EsphomeDeviceType = prefillType ?? directType;

  return (
    <>
      {!props.prefill && (
        <>
          <p className="step-description">
            {t('settings.manual_setup_desc_esphome')}
          </p>
          <div className="settings-form">
            <FormField label={t('settings.esphome_device_type_label')}>
              <Select
                value={directType}
                onChange={(e) =>
                  setDirectType(e.target.value as EsphomeDeviceType)
                }
                options={[
                  { value: 'litterbox', label: t('device_types.litterbox') },
                  {
                    value: 'water_fountain',
                    label: t('device_types.water_fountain'),
                  },
                ]}
              />
            </FormField>
          </div>
        </>
      )}

      {deviceType === 'litterbox' && <EsphomeLitterboxForm {...props} />}
      {deviceType === 'water_fountain' && (
        <EsphomeWaterFountainForm {...props} />
      )}
    </>
  );
};
