import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import {
  useDevice,
  useUpdateDevice,
  useDevices,
} from '@/hooks/queries/deviceQueries';
import { apiErrorMessage } from '@/api/apiClient';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/PageState';
import {
  FormCard,
  FormCardBody,
  FormCardHead,
  FormField,
  FormShell,
  FormSwitch,
  Input,
  Select,
  Textarea,
} from '@/components/ui/form';
import { LoadingState } from '@/components/ui/PageState';
import { AppHeader, AppHeaderBar } from '@/components/ui/AppHeader';
import { DiscardUnsavedDialog } from '@/components/ui/DiscardUnsavedDialog';
import { useAppForm, useUnsavedBlocker } from '@/hooks/form';
import { useBackNavigation } from '@/hooks/useBackNavigation';
import { DeviceSummary } from './components/DeviceSummary';
import { DeviceTypeTile } from './components/DeviceTypeTile';
import {
  getProviderBrand,
  providerBrandLabel,
} from './provider-wizard/flows/providerBrandRegistry.ts';
import './EditDevicePage.css';

interface DeviceFormValues {
  name: string;
  enabled: boolean;
  visitAnnotationEnabled: boolean;
  snapshotUrl: string;
  model: string;
  sourceDeviceId: string;
  promptTemplate: string;
  autoIdentify: boolean;
  origin: string;
  token: string;
}

const DEFAULT_FORM_VALUES: DeviceFormValues = {
  name: '',
  enabled: true,
  visitAnnotationEnabled: false,
  snapshotUrl: '',
  model: '',
  sourceDeviceId: '',
  promptTemplate: '',
  autoIdentify: true,
  origin: '',
  token: '',
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
    visitAnnotationEnabled: cfg?.visit_annotation_enabled === true,
    snapshotUrl: '',
    model: '',
    sourceDeviceId: '',
    promptTemplate: '',
    autoIdentify: true,
    origin: '',
    token: '',
  };
  if (!cfg) return base;
  if (device.type === 'camera' && device.provider === 'thingino') {
    return {
      ...base,
      origin: (cfg.origin as string) || '',
      token: (cfg.token as string) || '',
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
      sourceDeviceId: sid != null && sid !== '' ? String(sid) : '',
      promptTemplate: (cfg.prompt_template as string) || '',
      autoIdentify: cfg.auto_identify !== false,
    };
  }
  return base;
}

const EditDevicePage: React.FC = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const deviceId = parseInt(id || '0', 10);
  const back = useBackNavigation({
    to: '/settings/devices',
    label: t('settings.devices'),
  });

  const {
    data: device,
    isLoading,
    error,
  } = useDevice(deviceId, !!id, {
    refetchInterval: false,
  });
  const { data: allDevices = [] } = useDevices();
  const updateDevice = useUpdateDevice(deviceId);

  const {
    register,
    handleSubmit,
    control,
    formState: { isDirty },
  } = useAppForm<DeviceFormValues>({
    defaultValues: DEFAULT_FORM_VALUES,
    values: device ? deviceToFormValues(device) : undefined,
  });
  const { blockerOpen, onConfirmLeave, onCancelLeave, markSaved } =
    useUnsavedBlocker(isDirty);

  const [submitError, setSubmitError] = useState<string | null>(null);

  const onFormSubmit = async (data: DeviceFormValues) => {
    if (!device) return;
    setSubmitError(null);
    try {
      const existingConfig = (device.config as Record<string, unknown>) || {};
      let config: Record<string, unknown> | undefined;

      if (device.type === 'camera' && device.provider === 'thingino') {
        const {
          snapshotUrl: _snapshotUrl,
          recording: _recording,
          ...rest
        } = existingConfig;
        config = {
          ...rest,
          origin: data.origin,
          token: data.token.trim(),
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
        config: {
          ...(config ?? existingConfig),
          visit_annotation_enabled: data.visitAnnotationEnabled,
        },
      });
      markSaved();
      back.go();
    } catch (err) {
      console.error(err);
      setSubmitError(apiErrorMessage(err, t('settings.edit_device_error')));
    }
  };

  /*
   * The device's name is the page title once it loads; until then the page can
   * only say which page it is, so the mobile bar has something to show either
   * way.
   */
  const header = (title: React.ReactNode) => (
    <AppHeader>
      <AppHeaderBar
        back={{ to: back.to, label: back.label, onNavigate: back.go }}
        title={title}
      />
    </AppHeader>
  );

  if (isLoading) {
    return (
      <div className="page-shell-narrow page-edit-device">
        {header(t('settings.edit_device_title'))}
        <LoadingState message={t('settings.loading_device_data')} />
      </div>
    );
  }

  if (error || !device) {
    return (
      <div className="page-shell-narrow page-edit-device">
        {header(t('settings.edit_device_title'))}
        <EmptyState tone="error">
          <p>{t('devices.error_loading_device')}</p>
          <Button onClick={back.go}>{t('settings.back')}</Button>
        </EmptyState>
      </div>
    );
  }

  const sourceDeviceOptions = allDevices
    .filter((d) => d.type !== 'pet_recognizer' && d.id !== deviceId)
    .map((d) => ({ value: d.id.toString(), label: `${d.name} (${d.type})` }));

  const providerLabel = providerBrandLabel(
    getProviderBrand(device.provider),
    t,
  );

  return (
    <div className="page-shell-narrow page-edit-device">
      {header(device.name)}

      <FormShell
        onSubmit={handleSubmit(onFormSubmit)}
        error={submitError}
        actions={{
          onCancel: back.go,
          cancelLabel: t('settings.cancel'),
          submitLabel: updateDevice.isPending
            ? t('settings.saving')
            : t('settings.save_changes'),
          isSubmitting: updateDevice.isPending,
          submitDisabled: !isDirty,
        }}
      >
        <FormCard>
          <FormCardHead
            tile={<DeviceTypeTile type={device.type} size="lg" />}
            title={device.name}
            titleAs="h2"
            subtitle={`${t(`device_types.${device.type}`)} · ${providerLabel}`}
          />

          <FormCardBody>
            <FormField label={t('settings.device_name_label')}>
              <Input {...register('name', { required: true })} />
            </FormField>

            <FormSwitch
              name="enabled"
              control={control}
              label={t('settings.enabled')}
            />

            <FormSwitch
              name="visitAnnotationEnabled"
              control={control}
              label={t('settings.visit_annotation_label')}
              description={t('settings.visit_annotation_help')}
            />

            <DeviceSummary externalId={device.external_id} />

            {device.type === 'camera' && device.provider !== 'thingino' && (
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
                <FormField label={t('settings.camera_origin_label')}>
                  <Input
                    {...register('origin', { required: true })}
                    placeholder={t('settings.camera_origin_placeholder')}
                    autoComplete="off"
                  />
                </FormField>
                <FormField label={t('settings.webui_api_key_label')}>
                  <Input
                    type="password"
                    autoComplete="off"
                    {...register('token')}
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

                <FormField
                  label={t('settings.prompt_template_label')}
                  description={t('settings.prompt_template_help')}
                >
                  <Textarea
                    {...register('promptTemplate', { required: true })}
                    rows={8}
                  />
                </FormField>

                <FormSwitch
                  name="autoIdentify"
                  control={control}
                  label={t('settings.auto_identify_label')}
                />
              </>
            )}
          </FormCardBody>
        </FormCard>
      </FormShell>

      <DiscardUnsavedDialog
        open={blockerOpen}
        onConfirm={onConfirmLeave}
        onCancel={onCancelLeave}
      />
    </div>
  );
};

export default EditDevicePage;
