import React from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useDevices } from '@/hooks/queries/deviceQueries';
import DeviceCard from './components/DeviceCard';
import { Button } from '@/components/ui/Button';
import './Devices.css';

const Devices: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: devices, isLoading, error } = useDevices();

  if (isLoading) {
    return <div className="page-devices">{t('devices.loading')}</div>;
  }

  if (error) {
    return <div className="page-devices">{t('devices.error_loading')}</div>;
  }

  return (
    <div className="page-devices">
      <div className="devices-grid">
        {devices?.map((device) => (
          <DeviceCard key={device.id} device={device} />
        ))}

        {devices?.length === 0 && (
          <div className="empty-state">
            <p>{t('devices.no_devices_found')}</p>
            <Button onClick={() => navigate('/settings/devices/new')}>
              {t('settings.add_device')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Devices;
