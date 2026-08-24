import type * as React from 'react';
import type { Control, FieldValues } from 'react-hook-form';
import type { GetDeviceResponseDTO } from 'shared';

/**
 * Form shape shared by device registration and `/settings/devices/:id`.
 *
 * The shell owns `name`, `enabled`, and visit annotation. Provider fields
 * register under `config.<key>`, the same composition as account settings.
 */
export interface DeviceFormValues extends FieldValues {
  name: string;
  enabled: boolean;
  visitAnnotationEnabled: boolean;
  config: Record<string, unknown>;
}

export interface DeviceConfigFieldsProps {
  control: Control<DeviceFormValues>;
  /** `register` is first-time setup; `edit` is an existing device. */
  mode: 'register' | 'edit';
  existingDevices: GetDeviceResponseDTO[];
  /** Set on edit so a recognizer cannot pick itself as the source camera. */
  deviceId?: number;
}

/**
 * How a provider contributes its device settings to the shared form.
 *
 * `Fields` is ordinary JSX — not a field-descriptor DSL — so a provider can
 * grow a test-connection button or a conditional without a new abstraction.
 * Generic surfaces call `getDeviceConfigModule()` and never name a provider.
 */
export interface DeviceConfigModule {
  defaultConfigValues: Record<string, unknown>;
  /**
   * Existing config → form values. Must never throw: devices predating
   * validation can be missing fields and still have to open in the form.
   */
  toFormValues(config: unknown): Record<string, unknown>;
  /**
   * Form values → the config to persist, merged with `existing` so opaque
   * keys the module does not own (e.g. recognizer reference images) survive.
   * The shell writes `visit_annotation_enabled` after this returns.
   */
  toConfig(
    values: Record<string, unknown>,
    existing: Record<string, unknown>,
  ): Record<string, unknown>;
  Fields: React.FC<DeviceConfigFieldsProps>;
}
