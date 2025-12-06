import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { GetDeviceResponseDTO } from 'shared';
import { Camera, Utensils } from 'lucide-react';
import { WaterFountainIcon } from '@/components/icons/WaterFountainIcon';
import { LitterboxIcon } from '@/components/icons/LitterboxIcon';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/Card';
import { Tooltip } from '@/components/ui/Tooltip';
import WaterFountainStatus, {
  type WaterFountainState,
} from './WaterFountainStatus';
import { cn } from '@/lib/utils';
import './DeviceCard.css';

interface DeviceCardProps {
  device: GetDeviceResponseDTO;
  className?: string;
}

const DeviceCard: React.FC<DeviceCardProps> = ({ device, className }) => {
  const { t } = useTranslation();

  const getIcon = () => {
    switch (device.type) {
      case 'water_fountain':
        return <WaterFountainIcon />;
      case 'litterbox':
        return <LitterboxIcon />;
      case 'feeder':
        return <Utensils />;
      case 'camera':
        return <Camera />;
      default:
        return null;
    }
  };

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

  const waterFountainState = device.state as unknown as
    | WaterFountainState
    | undefined;

  return (
    <Card className={cn('device-card', className)}>
      <CardHeader>
        <div className="device-header-group">
          <Tooltip content={getStatusLabel()} position="bottom">
            <div className="device-icon-wrapper">
              {getIcon()}
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
        {device.type === 'water_fountain' && waterFountainState && (
          <WaterFountainStatus state={waterFountainState} />
        )}
        {device.type === 'water_fountain' && !waterFountainState && (
          <div className="text-sm text-muted-foreground p-4 text-center">
            {t('devices.no_status_data')}
          </div>
        )}
        {/* Add other device status components here */}
      </CardContent>
    </Card>
  );
};

export default DeviceCard;
