import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import AnnotationTab from './components/AnnotationTab';
import { useDevice } from '@/hooks/queries/deviceQueries';
import { isVisitAnnotationEnabled } from '@/lib/deviceAnnotation';
import { cn } from '@/lib/utils';
import './DeviceAnnotationPage.css';

const DeviceAnnotationPage: React.FC = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const deviceId = id ? parseInt(id, 10) : null;

  const { data: device, isLoading, error } = useDevice(deviceId!, !!deviceId);

  if (isLoading) {
    return <div>{t('devices.loading_device')}</div>;
  }

  if (error || !device) {
    return (
      <div>
        <div>{t('devices.error_loading_device')}</div>
        <Button onClick={() => navigate('/devices')}>{t('devices.back_to_devices')}</Button>
      </div>
    );
  }

  if (!isVisitAnnotationEnabled(device)) {
    return <Navigate to={`/devices/${device.id}`} replace />;
  }

  return (
    <div
      className={cn(
        'device-annotate-page',
        'page-viewport-fill',
        'page-shell-wide',
        'page-shell-bleed',
      )}
    >
      <AnnotationTab deviceId={device.id} />
    </div>
  );
};

export default DeviceAnnotationPage;
