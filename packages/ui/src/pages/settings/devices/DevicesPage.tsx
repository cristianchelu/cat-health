import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Settings as SettingsIcon, Smartphone } from 'lucide-react';
import { useDevices } from '@/hooks/queries/deviceQueries';
import { PageBackLink } from '@/components/ui/PageBackLink';
import { PageAddFab, PageAddLink } from '@/components/ui/PageAddAction';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { EmptyState, LoadingState } from '@/components/ui/PageState';
import { getDeviceIcon } from '@/components/icons/deviceIcons';
import {
  CardList,
  CardListContent,
  CardListItem,
} from '../components/CardList';
import './DevicesPage.css';

/**
 * Manage every registered device.
 *
 * The sibling of ProvidersPage: this is the settings-side list, where a row
 * leads to the device's own settings. `/devices` is the monitoring dashboard
 * and is a different surface with a different job.
 */
const DevicesPage: React.FC = () => {
  const { t } = useTranslation();
  const devicesQuery = useDevices();
  const devices = devicesQuery.data;

  return (
    <div className="settings-devices-page">
      <PageBackLink
        to="/settings"
        label={t('navigation.settings')}
        mobileTitle={t('settings.devices')}
      />

      <SectionHeader
        icon={<Smartphone size="1em" />}
        actions={
          <PageAddLink
            to="/settings/devices/new"
            label={t('settings.add_device')}
          />
        }
      >
        {t('settings.devices')}
      </SectionHeader>

      {devicesQuery.isPending ? (
        <LoadingState message={t('settings.loading_devices')} />
      ) : devicesQuery.error ? (
        <EmptyState
          className="settings-devices-error"
          message={t('settings.error_loading_devices')}
        />
      ) : (
        <CardList>
          {devices?.map((device) => (
            <CardListItem
              key={device.id}
              icon={getDeviceIcon(device.type, <SettingsIcon size="1em" />)}
              to={`/settings/devices/${device.id}`}
            >
              <CardListContent
                title={device.name}
                description={t(`device_types.${device.type}`)}
              />
            </CardListItem>
          ))}
        </CardList>
      )}

      <PageAddFab to="/settings/devices/new" label={t('settings.add_device')} />
    </div>
  );
};

export default DevicesPage;
