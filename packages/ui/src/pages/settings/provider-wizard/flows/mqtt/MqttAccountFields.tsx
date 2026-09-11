import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useWatch } from 'react-hook-form';
import {
  isSecureMqttUrl,
  isValidMqttTopicPrefix,
  MQTT_DEFAULT_TOPIC_PREFIX,
  parseMqttUrl,
} from 'shared';
import { FormInput, FormSwitch, FormTextarea } from '@/components/ui/form';
import type { ProviderAccountFieldsProps } from '../accountConfigTypes.ts';

const PEM_PLACEHOLDER = '-----BEGIN CERTIFICATE-----';

export const MqttAccountFields: React.FC<ProviderAccountFieldsProps> = ({
  control,
  mode,
}) => {
  const { t } = useTranslation();
  const url = useWatch({ control, name: 'config.url' });
  const secure = isSecureMqttUrl(typeof url === 'string' ? url : '');

  return (
    <>
      <FormInput
        name="config.url"
        control={control}
        type="url"
        autoComplete="off"
        label={t('settings.mqtt_url_label')}
        description={t('settings.mqtt_url_hint')}
        placeholder={t('settings.mqtt_url_placeholder')}
        rules={{
          required: t('settings.mqtt_url_required'),
          validate: (value: unknown) =>
            parseMqttUrl(String(value ?? '').trim()) !== undefined ||
            t('settings.mqtt_url_invalid'),
        }}
      />
      <FormInput
        name="config.username"
        control={control}
        autoComplete="username"
        label={t('settings.mqtt_username_label')}
        description={t('settings.mqtt_credentials_hint')}
        placeholder={t('settings.mqtt_username_placeholder')}
      />
      <FormInput
        name="config.password"
        control={control}
        type="password"
        autoComplete={mode === 'connect' ? 'new-password' : 'current-password'}
        label={t('settings.mqtt_password_label')}
      />
      <FormInput
        name="config.client_id"
        control={control}
        autoComplete="off"
        label={t('settings.mqtt_client_id_label')}
        description={t('settings.mqtt_client_id_hint')}
        placeholder={t('settings.mqtt_client_id_placeholder')}
      />

      <FormInput
        name="config.topic_prefix"
        control={control}
        autoComplete="off"
        label={t('settings.mqtt_topic_prefix_label')}
        description={t('settings.mqtt_topic_prefix_hint', {
          prefix: MQTT_DEFAULT_TOPIC_PREFIX,
        })}
        placeholder="cathealth/home"
        rules={{
          validate: (value: unknown) => {
            const prefix = String(value ?? '').trim();
            return (
              prefix === '' ||
              isValidMqttTopicPrefix(prefix) ||
              t('settings.mqtt_topic_prefix_invalid')
            );
          },
        }}
      />

      {secure && (
        <>
          <FormTextarea
            name="config.ca_cert"
            control={control}
            rows={4}
            spellCheck={false}
            label={t('settings.mqtt_ca_cert_label')}
            description={t('settings.mqtt_ca_cert_hint')}
            placeholder={PEM_PLACEHOLDER}
          />
          <FormTextarea
            name="config.client_cert"
            control={control}
            rows={4}
            spellCheck={false}
            label={t('settings.mqtt_client_cert_label')}
            description={t('settings.mqtt_client_cert_hint')}
            placeholder={PEM_PLACEHOLDER}
          />
          <FormTextarea
            name="config.client_key"
            control={control}
            rows={4}
            spellCheck={false}
            label={t('settings.mqtt_client_key_label')}
            placeholder="-----BEGIN PRIVATE KEY-----"
          />
          <FormSwitch
            name="config.allow_untrusted_certs"
            control={control}
            label={t('settings.mqtt_allow_untrusted_label')}
            description={t('settings.mqtt_allow_untrusted_hint')}
          />
        </>
      )}
    </>
  );
};
