import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { DeviceListItemDTO, SignalTone } from 'shared';
import {
  useDevices,
  useCameraPreviewAtlas,
} from '@/hooks/queries/deviceQueries';
import { useRegionalPreferences } from '@/contexts/RegionalPreferencesProvider';
import { AppHeader, AppHeaderBar } from '@/components/ui/AppHeader';
import {
  PageMainActionFab,
  PageMainAction,
} from '@/components/ui/PageMainAction';
import { EmptyState, LoadingState } from '@/components/ui/PageState';
import { StatusPill } from '@/components/ui/StatusPill';
import { rankDeviceSignals } from '@/lib/deviceSignalRanking';
import {
  partitionRoster,
  type RosterEmptyReason,
} from '@/lib/deviceMonitoring';
import DeviceCard, { type DeviceCardPreview } from './components/DeviceCard';
import './Devices.css';

const ADD_DEVICE_ROUTE = '/settings/devices/new';

/** Worst first, so the devices a user has to do something about come first. */
const ATTENTION_ORDER: Record<SignalTone, number> = {
  now: 0,
  soon: 1,
  calm: 2,
};

/**
 * The monitoring dashboard for devices that need day-to-day attention.
 *
 * Cameras and pet recognizers live under Settings; this roster is litterboxes,
 * feeders, and fountains only. Ungrouped and sorted by attention: grouping by
 * device type buries a single red box under whichever heading it belongs to,
 * and the question this page answers is "does anything need me", not "what do I
 * own". `/settings/devices` is the list for the latter.
 */
const Devices: React.FC = () => {
  const { t } = useTranslation();
  const { intlLanguageTag } = useRegionalPreferences();
  const { data: devices, isLoading, error } = useDevices();

  const collator = React.useMemo(
    () => new Intl.Collator(intlLanguageTag),
    [intlLanguageTag],
  );

  const { sorted, needingAttention, rosterCount, emptyReason } =
    React.useMemo(() => {
      const { roster, emptyReason } = partitionRoster(devices ?? []);

      const withAttention = roster.map(
        (device): { device: DeviceListItemDTO; attention: SignalTone } => ({
          device,
          attention: rankDeviceSignals(device.signals).attention ?? 'calm',
        }),
      );

      withAttention.sort((a, b) => {
        const byAttention =
          ATTENTION_ORDER[a.attention] - ATTENTION_ORDER[b.attention];
        return byAttention !== 0
          ? byAttention
          : collator.compare(a.device.name, b.device.name);
      });

      return {
        sorted: withAttention.map((entry) => entry.device),
        needingAttention: withAttention.filter(
          (entry) => entry.attention !== 'calm',
        ).length,
        rosterCount: roster.length,
        emptyReason,
      };
    }, [devices, collator]);

  return (
    <div className="page-devices">
      <AppHeader>
        <AppHeaderBar
          title={t('navigation.devices')}
          subtitle={
            rosterCount > 0 ? (
              <>
                {t('settings.device_count', { count: rosterCount })}
                {needingAttention > 0 ? (
                  <StatusPill variant="warn">
                    {t('devices.needing_attention', {
                      count: needingAttention,
                    })}
                  </StatusPill>
                ) : null}
              </>
            ) : null
          }
          actions={
            <PageMainAction
              to={ADD_DEVICE_ROUTE}
              label={t('settings.add_device')}
            />
          }
        />
      </AppHeader>

      <DeviceGrid
        devices={sorted}
        emptyReason={emptyReason}
        isLoading={isLoading}
        hasError={Boolean(error)}
      />

      <PageMainActionFab
        to={ADD_DEVICE_ROUTE}
        label={t('settings.add_device')}
      />
    </div>
  );
};

const DeviceGrid: React.FC<{
  devices: DeviceListItemDTO[];
  emptyReason: RosterEmptyReason | null;
  isLoading: boolean;
  hasError: boolean;
}> = ({ devices, emptyReason, isLoading, hasError }) => {
  const { t } = useTranslation();
  const { layout, cells, atlasUrl } = useCameraPreviewAtlas(
    !isLoading && !hasError && devices.length > 0,
  );

  if (isLoading) {
    return <LoadingState message={t('devices.loading')} />;
  }

  if (hasError) {
    return <EmptyState message={t('devices.error_loading')} />;
  }

  if (devices.length === 0) {
    return (
      <EmptyState
        message={
          emptyReason === 'all-switched-off'
            ? t('devices.all_switched_off')
            : t('devices.no_devices_found')
        }
      />
    );
  }

  return (
    <div className="page-devices-grid">
      {devices.map((device) => (
        <DeviceCard
          key={device.id}
          device={device}
          preview={cardPreview(device.id, atlasUrl, layout, cells)}
        />
      ))}
    </div>
  );
};

function cardPreview(
  deviceId: number,
  atlasUrl: string | undefined,
  layout: { width: number; height: number; cell_size: number } | undefined,
  cells: Map<number, { x: number; y: number }>,
): DeviceCardPreview | undefined {
  if (!atlasUrl || !layout) return undefined;
  const cell = cells.get(deviceId);
  if (!cell) return undefined;
  return {
    atlasUrl,
    atlasWidth: layout.width,
    atlasHeight: layout.height,
    cellSize: layout.cell_size,
    x: cell.x,
    y: cell.y,
  };
}

export default Devices;
