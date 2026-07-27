import * as React from 'react';
import { DefaultRegisterDeviceForm } from './DefaultRegisterDeviceForm';
import { EsphomeDirectForm } from './esphome/EsphomeDirectForm';
import type { RegisterDeviceFormProps } from './types';

/**
 * A discovered ESPHome device already reports its type, so it registers through
 * the canonical form. One added by host does not, so its own form asks — the
 * type selector lives in that form's card rather than floating above it.
 */
export const EsphomeRegisterDeviceForm: React.FC<RegisterDeviceFormProps> = (
  props,
) => {
  if (props.prefill) {
    return <DefaultRegisterDeviceForm {...props} />;
  }
  return <EsphomeDirectForm {...props} />;
};
