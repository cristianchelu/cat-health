import { getStringValue, isRecord } from '@/lib/utils';

export type CameraDeviceConfigFormValues = {
  snapshotUrl: string;
};

export const cameraDefaultConfigValues: CameraDeviceConfigFormValues = {
  snapshotUrl: '',
};

/** Never throws — a malformed config still has to open in the form. */
export function cameraToFormValues(
  config: unknown,
): CameraDeviceConfigFormValues {
  if (!isRecord(config)) return { ...cameraDefaultConfigValues };
  return {
    snapshotUrl: getStringValue(config, 'snapshotUrl') ?? '',
  };
}

export function cameraToConfig(
  values: Record<string, unknown>,
  existing: Record<string, unknown>,
): Record<string, unknown> {
  const { visit_annotation_enabled: _visitAnnotation, ...rest } = existing;
  return {
    ...rest,
    snapshotUrl: (getStringValue(values, 'snapshotUrl') ?? '').trim(),
  };
}
