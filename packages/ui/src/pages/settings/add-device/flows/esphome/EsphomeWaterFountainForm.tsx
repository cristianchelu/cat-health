import * as React from 'react';
import { DefaultRegisterDeviceForm } from '../DefaultRegisterDeviceForm';
import { EsphomeDirectForm } from './EsphomeDirectForm';
import type { RegisterDeviceFormProps } from '../types';

export const EsphomeWaterFountainForm: React.FC<RegisterDeviceFormProps> = (
  props,
) => {
  if (props.prefill) {
    return <DefaultRegisterDeviceForm {...props} />;
  }
  return <EsphomeDirectForm {...props} deviceType="water_fountain" />;
};
