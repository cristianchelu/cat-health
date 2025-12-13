import * as React from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import type { GetDeviceResponseDTO } from 'shared';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import './DeviceHeader.css';

interface DeviceHeaderProps {
  device: GetDeviceResponseDTO;
  className?: string;
}

export const DeviceHeader: React.FC<DeviceHeaderProps> = ({
  device,
  className,
}) => {
  const navigate = useNavigate();

  const formatType = (type: string) => {
    return type.replace(/_/g, ' ');
  };

  return (
    <div className={cn('device-header', className)}>
      <div className="device-header-main">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/devices')}
          className="back-button"
          aria-label="Go back"
        >
          <ArrowLeft className="icon" />
        </Button>
        <div className="device-info">
          <h1 className="device-name" title={device.name}>
            {device.name}
          </h1>
          <div className="device-meta">
            <span className="device-type">{formatType(device.type)}</span>
            <span className="separator">•</span>
            <span className="device-provider">{device.provider}</span>
            <span className="separator">•</span>
            <span className={cn('device-status', device.status)}>
              {device.status === 'offline'
                ? device.last_seen
                  ? `Last seen ${new Date(device.last_seen).toLocaleString()}`
                  : 'Never seen'
                : device.status}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
