import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { ListChecks, Pencil } from 'lucide-react';
import type { GetDeviceResponseDTO } from 'shared';
import { Button } from '@/components/ui/Button';
import { PageBackLink } from '@/components/ui/PageBackLink';
import {
  StatusPill,
  type StatusPillVariant,
} from '@/components/ui/StatusPill';
import {
  getProviderBrand,
  providerBrandLabel,
} from '@/pages/settings/provider-wizard/flows/providerBrandRegistry.ts';
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

const STATUS_VARIANTS: Record<string, StatusPillVariant> = {
  online: 'ok',
  offline: 'off',
  error: 'error',
};

const formatType = (type: string) => type.replace(/_/g, ' ');

export const DeviceHeader: React.FC<DeviceHeaderProps> = ({
  device,
  className,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { formatDateTime, dateFnsLocale } = useFormatters();

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
    <>
      {/*
        `mobileTitleAs` matters here: `.device-name` is `display: none` below
        767px, which drops it out of the accessibility tree. Promoting the back
        bar's title keeps exactly one <h1> per breakpoint.
      */}
      <PageBackLink
        to="/devices"
        label={t('navigation.devices')}
        mobileTitle={device.name}
        mobileTitleAs="h1"
      />
      <div className={cn('device-header', className)}>
        <div className="device-header-main">
          <div className="device-info">
            <h1 className="device-name" title={device.name}>
              {device.name}
            </h1>
            <div className="device-meta">
              <span className="device-type">{formatType(device.type)}</span>
              <span className="separator">•</span>
              <span className="device-provider">
                {providerBrandLabel(getProviderBrand(device.provider), t)}
              </span>
              <span className="separator">•</span>
              <StatusPill
                variant={STATUS_VARIANTS[device.status ?? ''] ?? 'neutral'}
                dot
                title={
                  device.status === 'offline' && lastSeenAbsolute
                    ? lastSeenAbsolute
                    : undefined
                }
              >
                {statusLabel}
              </StatusPill>
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
    </>
  );
};
