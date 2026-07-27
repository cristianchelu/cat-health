import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Plus, Server } from 'lucide-react';
import type { ProviderAccountDTO } from 'shared';
import { useProviderAccounts, useDevices } from '@/hooks/queries/deviceQueries';
import { PageBackLink } from '@/components/ui/PageBackLink';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState, LoadingState } from '@/components/ui/PageState';
import { cn } from '@/lib/utils';
import {
  CardList,
  CardListContent,
  CardListItem,
} from '../components/CardList';
import {
  getProviderBrand,
  providerBrandLabel,
} from '../provider-wizard/flows/providerBrandRegistry.ts';
import { ProviderBrandTile } from './components/ProviderBrandTile';
import { countDevicesByAccount } from './providerListUtils.ts';
import './ProvidersPage.css';

interface ProviderRowProps {
  account: ProviderAccountDTO;
  deviceCount: number;
}

const ProviderRow: React.FC<ProviderRowProps> = ({ account, deviceCount }) => {
  const { t } = useTranslation();
  const brand = getProviderBrand(account.provider);
  const identity = brand.accountIdentity?.(account.config);
  const label = providerBrandLabel(brand, t);
  /*
   * The brand tile is decorative, so the service a row belongs to has to be
   * readable text. Accounts named after their provider (the seeded internal
   * ones) already say it in the title — repeating it there would just be noise.
   */
  const brandLabel =
    account.name.trim().toLowerCase() === label.toLowerCase() ? null : label;
  const meta = [
    brandLabel,
    identity,
    t('settings.device_count', { count: deviceCount }),
  ].filter((part): part is string => Boolean(part));

  return (
    <CardListItem
      icon={<ProviderBrandTile provider={account.provider} />}
      to={`/settings/providers/${account.id}`}
      trailing={
        account.enabled ? null : (
          <StatusPill variant="off">{t('settings.disabled')}</StatusPill>
        )
      }
    >
      <CardListContent
        title={account.name}
        description={
          <span className="provider-row-meta">
            {meta.map((part, index) => (
              <React.Fragment key={part}>
                {index > 0 && (
                  <span className="provider-row-sep" aria-hidden="true" />
                )}
                <span>{part}</span>
              </React.Fragment>
            ))}
          </span>
        }
      />
    </CardListItem>
  );
};

const ProvidersPage: React.FC = () => {
  const { t } = useTranslation();
  const accountsQuery = useProviderAccounts();
  const devicesQuery = useDevices();

  const devices = devicesQuery.data;
  const deviceCounts = React.useMemo(
    () => countDevicesByAccount(devices ?? []),
    [devices],
  );

  const accounts = accountsQuery.data;
  const userAccounts = accounts?.filter((account) => !account.internal) ?? [];
  const systemAccounts = accounts?.filter((account) => account.internal) ?? [];

  /*
   * Without this the first paint renders the "no providers yet" state and then
   * swaps to the real list. On a Raspberry Pi that flash lasts long enough to
   * mis-tap, so wait for both queries: the device counts are part of every row
   * and "0 devices" is just as wrong as an empty list.
   */
  const isLoading = accountsQuery.isPending || devicesQuery.isPending;
  const error = accountsQuery.error ?? devicesQuery.error;

  return (
    <div className="providers-page">
      <PageBackLink
        to="/settings"
        label={t('navigation.settings')}
        mobileTitle={t('settings.providers')}
      />

      <SectionHeader
        icon={<Server size="1em" />}
        actions={
          <Link
            to="/settings/providers/new"
            className={cn('button', 'primary', 'md', 'providers-page-add')}
          >
            <Plus size="1em" />
            {t('settings.add_provider')}
          </Link>
        }
      >
        {t('settings.providers')}
      </SectionHeader>

      {isLoading ? (
        <LoadingState message={t('settings.loading_providers')} />
      ) : error ? (
        <EmptyState
          className="providers-page-error"
          message={t('settings.error_loading_providers')}
        />
      ) : (
        <>
          {userAccounts.length > 0 ? (
            <CardList>
              {userAccounts.map((account) => (
                <ProviderRow
                  key={account.id}
                  account={account}
                  deviceCount={deviceCounts.get(account.id) ?? 0}
                />
              ))}
            </CardList>
          ) : (
            /*
             * Deliberately not a tappable "Add provider" card: the header
             * button (desktop) and the FAB (mobile) are already the one add
             * affordance on this screen.
             */
            <EmptyState message={t('settings.no_providers')} />
          )}

          {systemAccounts.length > 0 && (
            <section className="providers-page-system">
              <h2>{t('settings.system_integrations')}</h2>
              <CardList>
                {systemAccounts.map((account) => (
                  <ProviderRow
                    key={account.id}
                    account={account}
                    deviceCount={deviceCounts.get(account.id) ?? 0}
                  />
                ))}
              </CardList>
            </section>
          )}
        </>
      )}

      <Link
        to="/settings/providers/new"
        className="providers-page-fab"
        aria-label={t('settings.add_provider')}
      >
        <Plus size={24} />
      </Link>
    </div>
  );
};

export default ProvidersPage;
