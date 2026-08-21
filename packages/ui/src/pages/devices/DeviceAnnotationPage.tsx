import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { AppHeader, AppHeaderBar } from '@/components/ui/AppHeader';
import AnnotationTab from './components/AnnotationTab';
import { useDevice } from '@/hooks/queries/deviceQueries';
import { useBackNavigation } from '@/hooks/useBackNavigation';
import { isVisitAnnotationEnabled } from '@/lib/deviceAnnotation';
import { cn } from '@/lib/utils';
import { parseDeviceRouteId } from './parseDeviceRouteId.ts';
import './DeviceAnnotationPage.css';

const DeviceAnnotationPage: React.FC = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const deviceId = parseDeviceRouteId(id);
  const invalidId = deviceId == null;

  const {
    data: device,
    isLoading,
    error,
  } = useDevice(deviceId ?? 0, !invalidId);

  const listBack = useBackNavigation({
    to: '/devices',
    label: t('navigation.devices'),
  });
  const deviceBack = useBackNavigation({
    to: device ? `/devices/${device.id}` : '/devices',
    label: device?.name ?? t('navigation.devices'),
  });

  if (isLoading) {
    return (
      <div className="page-shell-narrow">
        <AppHeader>
          <AppHeaderBar
            back={{
              to: listBack.to,
              label: listBack.label,
              onNavigate: listBack.go,
            }}
            title={t('devices.loading_device')}
          />
        </AppHeader>
        <p>{t('devices.loading_device')}</p>
      </div>
    );
  }

  if (invalidId || error || !device) {
    return (
      <div className="page-shell-narrow">
        <AppHeader>
          <AppHeaderBar
            back={{
              to: listBack.to,
              label: listBack.label,
              onNavigate: listBack.go,
            }}
            title={t('devices.error_loading_device')}
          />
        </AppHeader>
        <p>{t('devices.error_loading_device')}</p>
        <Button onClick={listBack.go}>{t('devices.back_to_devices')}</Button>
      </div>
    );
  }

  if (!isVisitAnnotationEnabled(device)) {
    return <Navigate to={`/devices/${device.id}`} replace />;
  }

  return (
    <div
      className={cn(
        'page-device-annotation',
        'page-viewport-fill',
        'page-shell-wide',
        'page-shell-bleed',
      )}
    >
      <AppHeader className="device-annotation-header">
        <AppHeaderBar
          back={{
            to: deviceBack.to,
            label: deviceBack.label,
            onNavigate: deviceBack.go,
          }}
          title={device.name}
        />
      </AppHeader>
      <AnnotationTab deviceId={device.id} />
    </div>
  );
};

export default DeviceAnnotationPage;
