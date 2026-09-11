import { isSecureMqttUrl, parseMqttUrl } from 'shared';
import { getStringValue, isRecord } from '@/lib/utils';

/**
 * Pure helpers for the MQTT broker account config. Provider-scoped: only
 * provider modules may read account-config internals.
 */

export type MqttConfigFormValues = {
  url: string;
  username: string;
  password: string;
  client_id: string;
  ca_cert: string;
  client_cert: string;
  client_key: string;
  allow_untrusted_certs: boolean;
};

export const mqttDefaultConfigValues: MqttConfigFormValues = {
  url: '',
  username: '',
  password: '',
  client_id: '',
  ca_cert: '',
  client_cert: '',
  client_key: '',
  allow_untrusted_certs: false,
};

/** Never throws — a malformed config still has to open in the form. */
export function mqttToFormValues(config: unknown): MqttConfigFormValues {
  if (!isRecord(config)) return { ...mqttDefaultConfigValues };
  return {
    url: getStringValue(config, 'url') ?? '',
    username: getStringValue(config, 'username') ?? '',
    password: getStringValue(config, 'password') ?? '',
    client_id: getStringValue(config, 'client_id') ?? '',
    ca_cert: getStringValue(config, 'ca_cert') ?? '',
    client_cert: getStringValue(config, 'client_cert') ?? '',
    client_key: getStringValue(config, 'client_key') ?? '',
    allow_untrusted_certs: config.allow_untrusted_certs === true,
  };
}

/**
 * Blank optional fields are left out rather than stored as `''`, so the
 * stored config says what the user set and nothing more. The password is not
 * trimmed; every other field is an address, a name or PEM, where surrounding
 * whitespace is never meaningful. TLS material is dropped on a plain scheme:
 * the form hides those fields then, and what it hides it must not keep.
 */
export function mqttToConfig(
  values: Record<string, unknown>,
): Record<string, unknown> {
  const url = (getStringValue(values, 'url') ?? '').trim();
  const secure = isSecureMqttUrl(url);
  const config: Record<string, unknown> = { url };
  const keys = secure
    ? ['username', 'client_id', 'ca_cert', 'client_cert', 'client_key']
    : ['username', 'client_id'];
  for (const key of keys) {
    const value = (getStringValue(values, key) ?? '').trim();
    if (value) config[key] = value;
  }
  const password = getStringValue(values, 'password') ?? '';
  if (password) config.password = password;
  if (secure && values.allow_untrusted_certs === true) {
    config.allow_untrusted_certs = true;
  }
  return config;
}

/** Short identity line for the providers listing: the broker host and port. */
export function mqttAccountIdentity(config: unknown): string | undefined {
  if (!isRecord(config)) return undefined;
  const raw = getStringValue(config, 'url');
  if (!raw) return undefined;
  const url = parseMqttUrl(raw);
  return url ? url.host : raw;
}
