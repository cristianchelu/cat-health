import * as React from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { GetDeviceResponseDTO } from 'shared';
import { getDeviceIcon } from '@/components/icons/deviceIcons';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/Card';
import { Tooltip } from '@/components/ui/Tooltip';
import { resolveDeviceCardStatus } from './deviceCardStatusRegistry';
import { cn } from '@/lib/utils';
import './DeviceCard.css';

interface DeviceCardProps {
  device: GetDeviceResponseDTO;
  className?: string;
}

const DeviceCard: React.FC<DeviceCardProps> = ({ device, className }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const getStatusLabel = () => {
    switch (device.status) {
      case 'online':
        return t('devices.status.online');
      case 'offline':
        return t('devices.status.offline');
      case 'error':
        return t('devices.status.error');
      default:
        return t('devices.status.unknown');
    }
  };

  const getStatusClass = () => {
    switch (device.status) {
      case 'online':
        return 'status-online';
      case 'offline':
        return 'status-offline';
      case 'error':
        return 'status-error';
      default:
        return 'status-offline';
    }
  };

  const cardStatus = resolveDeviceCardStatus(device);

  return (
    <Card
      className={cn('device-card', className)}
      onClick={() => navigate(`/devices/${device.id}`)}
    >
      <CardHeader>
        <div className="device-header-group">
          <Tooltip content={getStatusLabel()} position="bottom">
            <div className="device-icon-wrapper">
              {getDeviceIcon(device.type)}
              <div className={cn('status-indicator', getStatusClass())} />
            </div>
          </Tooltip>
          <div className="device-info">
            <CardTitle>{device.name}</CardTitle>
            <CardDescription className="capitalize">
              {t(`device_types.${device.type}`)}
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {cardStatus ? React.createElement(cardStatus, { device }) : null}
      </CardContent>
    </Card>
  );
};

export default DeviceCard;
