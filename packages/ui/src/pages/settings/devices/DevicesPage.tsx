import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Settings as SettingsIcon } from 'lucide-react';
import type { DeviceType } from 'shared';
import { useDevices } from '@/hooks/queries/deviceQueries';
import { useRegionalPreferences } from '@/contexts/RegionalPreferencesProvider';
import { AppHeader, AppHeaderBar } from '@/components/ui/AppHeader';
import {
  PageMainActionFab,
  PageMainAction,
} from '@/components/ui/PageMainAction';
import { ListToolbar } from '@/components/ui/ListToolbar';
import { SearchInput } from '@/components/ui/SearchInput';
import { SortControl } from '@/components/ui/SortControl';
import { MetaLine } from '@/components/ui/MetaLine';
import { StatusPill } from '@/components/ui/StatusPill';
import { deviceInactiveReason } from '@/lib/deviceMonitoring';
import { EmptyState, LoadingState } from '@/components/ui/PageState';
import { getDeviceIcon } from '@/components/icons/deviceIcons';
import {
  CardList,
  CardListContent,
  CardListItem,
} from '@/components/ui/CardList';
import {
  getProviderBrand,
  providerBrandLabel,
} from '../provider-wizard/flows/providerBrandRegistry.ts';
import {
  DEVICE_SORT_KEYS,
  filterDevices,
  sortDevices,
  type DeviceSort,
} from './deviceListUtils.ts';
import './DevicesPage.css';

/**
 * Below this many devices the toolbar is pure chrome — the whole list is
 * visible at once, and searching it costs more than scanning it.
 */
const TOOLBAR_MIN_DEVICES = 2;

/**
 * Manage every registered device.
 *
 * The sibling of ProvidersPage: this is the settings-side list, where a row
 * leads to the device's own settings. `/devices` is the monitoring dashboard
 * and is a different surface with a different job — so a row here carries the
 * device and its type, and no live status.
 */
const DevicesPage: React.FC = () => {
  const { t } = useTranslation();
  const { intlLanguageTag } = useRegionalPreferences();
  const devicesQuery = useDevices();
  const devices = devicesQuery.data;

  const [query, setQuery] = React.useState('');
  const [sort, setSort] = React.useState<DeviceSort>({
    key: 'type',
    direction: 'asc',
  });

  /*
   * A device carries its provider key, so the brand label needs no second query
   * — which also means no two-query loading guard on this page. The provider
   * *account* name would need one; the brand is what the row is claiming here.
   */
  const labels = React.useMemo(
    () => ({
      typeLabel: (type: DeviceType) => t(`device_types.${type}`),
      providerLabel: (provider: string) =>
        providerBrandLabel(getProviderBrand(provider), t),
    }),
    [t],
  );

  /*
   * Both the grouping and the ordering follow the labels on screen, so they
   * have to collate in the user's language rather than the browser default.
   */
  const collator = React.useMemo(
    () => new Intl.Collator(intlLanguageTag),
    [intlLanguageTag],
  );

  const visibleDevices = React.useMemo(
    () =>
      sortDevices(filterDevices(devices ?? [], query, labels), sort, {
        labels,
        collator,
      }),
    [devices, query, sort, labels, collator],
  );

  const sortOptions = DEVICE_SORT_KEYS.map((key) => ({
    value: key,
    label: t(`common.sort_by_${key}`),
  }));

  const deviceCount = devices?.length ?? 0;

  return (
    <div className="page-shell-narrow settings-devices-page">
      <AppHeader>
        <AppHeaderBar
          back={{ to: '/settings', label: t('navigation.settings') }}
          title={t('settings.devices')}
          actions={
            <PageMainAction
              to="/settings/devices/new"
              label={t('settings.add_device')}
            />
          }
        />
      </AppHeader>

      {devicesQuery.isPending ? (
        <LoadingState message={t('settings.loading_devices')} />
      ) : devicesQuery.error ? (
        <EmptyState
          className="settings-devices-error"
          message={t('settings.error_loading_devices')}
        />
      ) : (
        <>
          {deviceCount >= TOOLBAR_MIN_DEVICES && (
            <ListToolbar
              search={
                <SearchInput
                  value={query}
                  onValueChange={setQuery}
                  label={t('settings.search_devices')}
                  placeholder={t('settings.search_devices')}
                />
              }
            >
              <SortControl
                label={t('common.sort_by')}
                options={sortOptions}
                value={sort.key}
                onValueChange={(key) => setSort((prev) => ({ ...prev, key }))}
                direction={sort.direction}
                onDirectionChange={(direction) =>
                  setSort((prev) => ({ ...prev, direction }))
                }
              />
            </ListToolbar>
          )}

          {visibleDevices.length === 0 ? (
            <EmptyState
              message={
                deviceCount === 0
                  ? t('settings.no_devices_yet')
                  : t('settings.no_matching_devices')
              }
            />
          ) : (
            <CardList>
              {visibleDevices.map((device) => {
                const type = labels.typeLabel(device.type);
                const provider = labels.providerLabel(device.provider);
                const inactiveReason = deviceInactiveReason(device);

                return (
                  <CardListItem
                    key={device.id}
                    icon={getDeviceIcon(
                      device.type,
                      <SettingsIcon size="1em" />,
                    )}
                    to={`/settings/devices/${device.id}`}
                    // Matches ProvidersPage. Disabled rows keep their place in
                    // the sort, since this page is where you switch one back on
                    // — and the pill names which switch to reach for.
                    trailing={
                      inactiveReason ? (
                        <StatusPill variant="off">
                          {t(
                            inactiveReason === 'account'
                              ? 'devices.status.account_disabled'
                              : 'devices.status.disabled',
                          )}
                        </StatusPill>
                      ) : null
                    }
                  >
                    <CardListContent
                      title={device.name}
                      description={
                        <MetaLine
                          parts={[
                            type,
                            /*
                             * A camera on the built-in "Camera" provider would
                             * otherwise read "Camera · Camera" — the same word
                             * twice tells you nothing the first one did not.
                             */
                            provider.toLowerCase() === type.toLowerCase()
                              ? null
                              : provider,
                          ]}
                        />
                      }
                    />
                  </CardListItem>
                );
              })}
            </CardList>
          )}
        </>
      )}

      <PageMainActionFab
        to="/settings/devices/new"
        label={t('settings.add_device')}
      />
    </div>
  );
};

export default DevicesPage;
