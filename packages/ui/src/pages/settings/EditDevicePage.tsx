import React, { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import {
  useDevice,
  useUpdateDevice,
  useDevices,
} from '@/hooks/queries/deviceQueries';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Button } from '@/components/ui/Button';
import { FormField, Input, Textarea, Select } from '@/components/ui/form';
import { Switch } from '@/components/ui/Switch';
import { Smartphone, Check } from 'lucide-react';
import './EditDevicePage.css';

interface DeviceFormValues {
  name: string;
  enabled: boolean;
  snapshotUrl: string;
  model: string;
  sourceDeviceId: string;
  promptTemplate: string;
  autoIdentify: boolean;
  sshUser: string;
  sshPrivateKeyPath: string;
  remotePath: string;
  clipDurationSeconds: number;
}

const DEFAULT_FORM_VALUES: DeviceFormValues = {
  name: '',
  enabled: true,
  snapshotUrl: '',
  model: '',
  sourceDeviceId: '',
  promptTemplate: '',
  autoIdentify: true,
  sshUser: '',
  sshPrivateKeyPath: '',
  remotePath: '',
  clipDurationSeconds: 120,
};

function deviceToFormValues(device: {
  name: string;
  enabled: boolean;
  type: string;
  provider?: string;
  config?: unknown;
}): DeviceFormValues {
  const cfg = device.config as Record<string, unknown> | undefined;
  const base = {
    name: device.name,
    enabled: device.enabled,
    snapshotUrl: '',
    model: '',
    sourceDeviceId: '',
    promptTemplate: '',
    autoIdentify: true,
    sshUser: '',
    sshPrivateKeyPath: '',
    remotePath: '',
    clipDurationSeconds: 120,
  };
  if (!cfg) return base;
  if (device.type === 'camera' && device.provider === 'thingino') {
    const rec = cfg.recording as Record<string, unknown> | undefined;
    const ssh = rec?.ssh as Record<string, unknown> | undefined;
    return {
      ...base,
      snapshotUrl: (cfg.snapshotUrl as string) || '',
      sshUser: (ssh?.user as string) || '',
      sshPrivateKeyPath: (ssh?.privateKeyPath as string) || '',
      remotePath: (rec?.remotePath as string) || '',
      clipDurationSeconds: (rec?.clipDurationSeconds as number) ?? 120,
    };
  }
  if (device.type === 'camera') {
    return { ...base, snapshotUrl: (cfg.snapshotUrl as string) || '' };
  }
  if (device.type === 'pet_recognizer') {
    const sid = cfg.source_device_id;
    return {
      ...base,
      model: (cfg.model as string) || '',
      sourceDeviceId:
        sid != null && sid !== '' ? String(sid) : '',
      promptTemplate: (cfg.prompt_template as string) || '',
      autoIdentify: cfg.auto_identify !== false,
    };
  }
  return base;
}

const EditDevicePage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const deviceId = parseInt(id || '0', 10);

  const { data: device, isLoading, error } = useDevice(deviceId, !!id, {
    refetchInterval: false,
  });
  const { data: allDevices = [] } = useDevices();
  const updateDevice = useUpdateDevice(deviceId);

  const { register, handleSubmit, control } = useForm<DeviceFormValues>({
    defaultValues: DEFAULT_FORM_VALUES,
    values: device ? deviceToFormValues(device) : undefined,
  });

  const [submitError, setSubmitError] = useState<string | null>(null);

  const onFormSubmit = async (data: DeviceFormValues) => {
    if (!device) return;
    setSubmitError(null);
    try {
      const existingConfig = (device.config as Record<string, unknown>) || {};
      let config: Record<string, unknown> | undefined;

      if (device.type === 'camera' && device.provider === 'thingino') {
        config = {
          ...existingConfig,
          snapshotUrl: data.snapshotUrl,
          recording: {
            ssh: {
              user: data.sshUser,
              privateKeyPath: data.sshPrivateKeyPath,
            },
            remotePath: data.remotePath,
            clipDurationSeconds: data.clipDurationSeconds,
          },
        };
      } else if (device.type === 'camera') {
        config = { ...existingConfig, snapshotUrl: data.snapshotUrl };
      } else if (device.type === 'pet_recognizer') {
        config = {
          ...existingConfig,
          model: data.model,
          source_device_id: data.sourceDeviceId
            ? Number(data.sourceDeviceId)
            : null,
          prompt_template: data.promptTemplate,
          auto_identify: data.autoIdentify,
        };
      }

      await updateDevice.mutateAsync({
        name: data.name,
        enabled: data.enabled,
        ...(config !== undefined && { config }),
      });
      navigate('/settings');
    } catch (err) {
      console.error(err);
      setSubmitError(t('settings.edit_device_error'));
    }
  };

  if (isLoading) {
    return (
      <div className="edit-device-page">
        <div className="loading-state">{t('settings.loading_device_data')}</div>
      </div>
    );
  }

  if (error || !device) {
    return (
      <div className="edit-device-page">
        <div className="error-state">
          <p>{t('devices.error_loading_device')}</p>
          <Button onClick={() => navigate('/settings')}>{t('settings.back')}</Button>
        </div>
      </div>
    );
  }

  const sourceDeviceOptions = allDevices
    .filter((d) => d.type !== 'pet_recognizer' && d.id !== deviceId)
    .map((d) => ({ value: d.id.toString(), label: `${d.name} (${d.type})` }));

  return (
    <div className="edit-device-page">
      <SectionHeader icon={<Smartphone size="1em" />}>
        {t('settings.edit_device_title')}
      </SectionHeader>

      <form onSubmit={handleSubmit(onFormSubmit)} className="settings-form">
        <FormField label={t('settings.device_name_label')}>
          <Input {...register('name', { required: true })} />
        </FormField>

        <FormField label={t('settings.enabled')}>
          <div className="switch-row">
            <Controller
              name="enabled"
              control={control}
              render={({ field }) => (
                <>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    ref={field.ref}
                  />
                  <span>{field.value ? t('settings.enabled') : t('settings.disabled')}</span>
                </>
              )}
            />
          </div>
        </FormField>

        <div className="device-summary">
          <div className="summary-item">
            <span className="label">{t('settings.type_label')}</span>
            <span className="value">{t(`device_types.${device.type}`)}</span>
          </div>
          <div className="summary-item">
            <span className="label">{t('settings.external_id_label')}</span>
            <span className="value">{device.external_id}</span>
          </div>
        </div>

        {device.type === 'camera' && (
          <FormField label={t('settings.snapshot_url_label')}>
            <Input
              {...register('snapshotUrl')}
              placeholder={t('settings.snapshot_url_placeholder')}
            />
            <p className="help-text">{t('settings.snapshot_url_help')}</p>
          </FormField>
        )}

        {device.provider === 'thingino' && device.type === 'camera' && (
          <>
            <FormField label={t('settings.ssh_user_label')}>
              <Input {...register('sshUser')} placeholder="root" />
            </FormField>
            <FormField label={t('settings.ssh_key_path_label')}>
              <Input
                {...register('sshPrivateKeyPath')}
                placeholder="/path/to/key"
              />
            </FormField>
            <FormField label={t('settings.remote_path_label')}>
              <Input
                {...register('remotePath')}
                placeholder="/mnt/sd/recordings"
              />
            </FormField>
            <FormField label={t('settings.clip_duration_label')}>
              <Input
                type="number"
                {...register('clipDurationSeconds', { valueAsNumber: true })}
              />
            </FormField>
          </>
        )}

        {device.type === 'pet_recognizer' && (
          <>
            <FormField label={t('settings.source_device_label')}>
              <Select
                {...register('sourceDeviceId', { required: true })}
                placeholder={t('settings.source_device_placeholder')}
                options={sourceDeviceOptions}
              />
            </FormField>

            <FormField label={t('settings.model_label')}>
              <Input
                {...register('model', { required: true })}
                placeholder={t('settings.model_placeholder')}
              />
            </FormField>

            <FormField label={t('settings.prompt_template_label')}>
              <Textarea
                {...register('promptTemplate', { required: true })}
                rows={6}
              />
            </FormField>

            <FormField label={t('settings.auto_identify_label')}>
              <div className="switch-row">
                <Controller
                  name="autoIdentify"
                  control={control}
                  render={({ field }) => (
                    <>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        ref={field.ref}
                      />
                      <span>
                        {field.value ? t('settings.enabled') : t('settings.disabled')}
                      </span>
                    </>
                  )}
                />
              </div>
            </FormField>
          </>
        )}

        {submitError && <div className="error-message">{submitError}</div>}

        <div className="form-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate('/settings')}
          >
            {t('settings.cancel')}
          </Button>
          <Button type="submit" disabled={updateDevice.isPending}>
            <Check size="1em" />
            {updateDevice.isPending
              ? t('settings.saving')
              : t('settings.save_changes')}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default EditDevicePage;
