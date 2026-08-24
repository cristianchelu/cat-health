import { getStringValue, isRecord } from '@/lib/utils';

export type ThinginoDeviceConfigFormValues = {
  origin: string;
  token: string;
};

export const thinginoDefaultConfigValues: ThinginoDeviceConfigFormValues = {
  origin: '',
  token: '',
};

/** Never throws — a malformed config still has to open in the form. */
export function thinginoToFormValues(
  config: unknown,
): ThinginoDeviceConfigFormValues {
  if (!isRecord(config)) return { ...thinginoDefaultConfigValues };
  return {
    origin: getStringValue(config, 'origin') ?? '',
    token: getStringValue(config, 'token') ?? '',
  };
}

export function thinginoToConfig(
  values: Record<string, unknown>,
  existing: Record<string, unknown>,
): Record<string, unknown> {
  const {
    snapshotUrl: _snapshotUrl,
    recording: _recording,
    visit_annotation_enabled: _visitAnnotation,
    ...rest
  } = existing;
  return {
    ...rest,
    origin: (getStringValue(values, 'origin') ?? '').trim(),
    token: (getStringValue(values, 'token') ?? '').trim(),
  };
}
