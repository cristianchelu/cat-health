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
} from '@/components/ui/form';
import { LoadingState } from '@/components/ui/PageState';
import { AppHeader, AppHeaderBar } from '@/components/ui/AppHeader';
import { DiscardUnsavedDialog } from '@/components/ui/DiscardUnsavedDialog';
import { useAppForm, useUnsavedBlocker } from '@/hooks/form';
import { useBackNavigation } from '@/hooks/useBackNavigation';
import { isRecord } from '@/lib/utils';
import { isVisitAnnotationEnabled } from '@/lib/deviceAnnotation';
import { DeviceSummary } from './components/DeviceSummary';
import { DeviceTypeTile } from './components/DeviceTypeTile';
import {
  getProviderBrand,
  providerBrandLabel,
} from './provider-wizard/flows/providerBrandRegistry.ts';
import { getDeviceConfigModule } from './provider-wizard/flows/deviceConfigRegistry.ts';
import type { DeviceFormValues } from './provider-wizard/flows/deviceConfigTypes.ts';
import './EditDevicePage.css';

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

  const provider = device?.provider ?? '';
  const configModule = getDeviceConfigModule(provider);

  const formValues = React.useMemo<DeviceFormValues | undefined>(
    () =>
      device
        ? {
            name: device.name,
            enabled: device.enabled,
            visitAnnotationEnabled: isVisitAnnotationEnabled(device),
            config: configModule.toFormValues(device.config),
          }
        : undefined,
    [device, configModule],
  );

  const {
    register,
    handleSubmit,
    control,
    formState: { isDirty },
  } = useAppForm<DeviceFormValues>({
    defaultValues: {
      name: '',
      enabled: true,
      visitAnnotationEnabled: false,
      config: {},
    },
    values: formValues,
  });
  const { blockerOpen, onConfirmLeave, onCancelLeave, markSaved } =
    useUnsavedBlocker(isDirty);

  const [submitError, setSubmitError] = useState<string | null>(null);

  const onFormSubmit = async (data: DeviceFormValues) => {
    if (!device) return;
    setSubmitError(null);
    try {
      const existingConfig = isRecord(device.config) ? device.config : {};
      await updateDevice.mutateAsync({
        name: data.name,
        enabled: data.enabled,
        config: {
          ...configModule.toConfig(data.config, existingConfig),
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

            <configModule.Fields
              control={control}
              mode="edit"
              existingDevices={allDevices}
              deviceId={deviceId}
            />
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
