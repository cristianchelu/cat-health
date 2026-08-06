import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { ListChecks, Pencil } from 'lucide-react';
import type { GetDeviceResponseDTO } from 'shared';
import { Button } from '@/components/ui/Button';
import {
  AppHeader,
  AppHeaderBar,
  AppHeaderRow,
} from '@/components/ui/AppHeader';
import { StatusPill, type StatusPillVariant } from '@/components/ui/StatusPill';
import {
  getProviderBrand,
  providerBrandLabel,
} from '@/pages/settings/provider-wizard/flows/providerBrandRegistry.ts';
import {
  coerceEpochDate,
  formatRelativeTimeAgo,
  isMeaningfulLastSeen,
} from '@/lib/formatRelativeTime';
import { backState } from '@/lib/navigationBack';
import { useFormatters } from '@/contexts/RegionalPreferencesProvider';
import { isVisitAnnotationEnabled } from '@/lib/deviceAnnotation';
import './DeviceHeader.css';

interface DeviceHeaderProps {
  device: GetDeviceResponseDTO;
  className?: string;
  /**
   * The page's tab list, rendered as the app bar's bottom row. It sits inside
   * the header rather than under it so that scrolling a long history away still
   * leaves you somewhere to go — see `AppHeader`'s `revealTabsOnly`.
   */
  tabs?: React.ReactNode;
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
  tabs,
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
    <AppHeader className={className}>
      <AppHeaderBar
        back={{ to: '/devices', label: t('navigation.devices') }}
        title={device.name}
        /* What the title can't say: type, provider, and how it's doing. */
        subtitle={
          <span className="device-meta">
            <span className="device-type">{formatType(device.type)}</span>
            <span className="separator">•</span>
            <span className="device-provider">
              {providerBrandLabel(getProviderBrand(device.provider), t)}
            </span>
            {/* No separator before the pill — it is not a text item, and on a
                phone the meta line wraps, which left a bullet dangling. */}
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
          </span>
        }
        actions={
          <>
            {isVisitAnnotationEnabled(device) && (
              <Link
                to={`/devices/${device.id}/annotate`}
                state={backState(`/devices/${device.id}`, device.name)}
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
              onClick={() =>
                navigate(`/settings/devices/${device.id}`, {
                  state: backState(`/devices/${device.id}`, device.name),
                })
              }
              className="edit-button"
              aria-label={t('settings.edit_device_title')}
            >
              <Pencil className="icon" />
            </Button>
          </>
        }
      />
      {tabs ? <AppHeaderRow>{tabs}</AppHeaderRow> : null}
    </AppHeader>
  );
};
