import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft, ListChecks, Pencil } from 'lucide-react';
import type { GetDeviceResponseDTO } from 'shared';
import { Button } from '@/components/ui/Button';
import {
  coerceEpochDate,
  formatRelativeTimeAgo,
  isMeaningfulLastSeen,
} from '@/lib/formatRelativeTime';
import { useFormatters } from '@/contexts/RegionalPreferencesProvider';
import { cn } from '@/lib/utils';
import { isVisitAnnotationEnabled } from '@/lib/deviceAnnotation';
import './DeviceHeader.css';

interface DeviceHeaderProps {
  device: GetDeviceResponseDTO;
  className?: string;
}

export const DeviceHeader: React.FC<DeviceHeaderProps> = ({
  device,
  className,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { formatDateTime, dateFnsLocale } = useFormatters();

  const formatType = (type: string) => {
    return type.replace(/_/g, ' ');
  };

  const lastSeenCandidate = device.last_seen
    ? coerceEpochDate(device.last_seen)
    : null;
  const lastSeenDate = isMeaningfulLastSeen(lastSeenCandidate)
    ? lastSeenCandidate
    : null;
  const lastSeenRelative =
    lastSeenDate != null
      ? formatRelativeTimeAgo(lastSeenDate, { locale: dateFnsLocale })
      : null;
  const lastSeenAbsolute =
    lastSeenDate != null ? formatDateTime(lastSeenDate) : undefined;

  const statusLabel =
    device.status === 'offline'
      ? lastSeenDate != null
        ? t('devices.last_seen', {
            time: lastSeenRelative ?? lastSeenAbsolute ?? '—',
          })
        : t('devices.never_seen')
      : t(`devices.status.${device.status}`);

  return (
    <div className={cn('device-header', className)}>
      <div className="device-header-main">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/devices')}
          className="back-button"
          aria-label={t('devices.go_back')}
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
            <span
              className={cn('device-status', device.status)}
              title={
                device.status === 'offline' && lastSeenAbsolute
                  ? lastSeenAbsolute
                  : undefined
              }
            >
              {statusLabel}
            </span>
          </div>
        </div>
      </div>
      <div className="device-header-actions">
        {isVisitAnnotationEnabled(device) && (
          <Link
            to={`/devices/${device.id}/annotate`}
            className="device-header-icon-action"
            aria-label={t('devices.open_annotation_workspace')}
            title={t('devices.open_annotation_workspace')}
          >
            <ListChecks className="icon" />
          </Link>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/settings/devices/${device.id}`)}
          className="edit-button"
          aria-label={t('settings.edit_device_title')}
        >
          <Pencil className="icon" />
        </Button>
      </div>
    </div>
  );
};
