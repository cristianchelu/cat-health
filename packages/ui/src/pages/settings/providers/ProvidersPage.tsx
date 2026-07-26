import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Plus, Server } from 'lucide-react';
import type { ProviderAccountDTO } from 'shared';
import { useProviderAccounts, useDevices } from '@/hooks/queries/deviceQueries';
import { PageBackLink } from '@/components/ui/PageBackLink';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { cn } from '@/lib/utils';
import {
  CardList,
  CardListContent,
  CardListItem,
} from '../components/CardList';
import { getProviderBrand } from '../provider-wizard/flows/providerBrandRegistry.ts';
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
            {identity && <span>{identity}</span>}
            {identity && <span className="provider-row-sep" aria-hidden="true" />}
            <span>{t('settings.device_count', { count: deviceCount })}</span>
          </span>
        }
      />
    </CardListItem>
  );
};

const ProvidersPage: React.FC = () => {
  const { t } = useTranslation();
  const { data: accounts = [] } = useProviderAccounts();
  const { data: devices = [] } = useDevices();

  const deviceCounts = React.useMemo(
    () => countDevicesByAccount(devices),
    [devices],
  );

  const userAccounts = accounts.filter((account) => !account.internal);
  const systemAccounts = accounts.filter((account) => account.internal);

  return (
    <div className="providers-page">
      <PageBackLink
        to="/settings"
        label={t('settings.title')}
        mobileTitle={t('settings.providers')}
      />

      <SectionHeader
        icon={<Server size="1em" />}
        actions={
          <Link
            to="/settings/providers/new"
            className={cn('button', 'primary', 'md')}
          >
            <Plus size="1em" />
            {t('settings.add_provider')}
          </Link>
        }
      >
        {t('settings.providers')}
      </SectionHeader>

      <p className="providers-page-intro">{t('settings.providers_intro')}</p>

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
        <CardList>
          <CardListItem
            icon={<Server size="1em" />}
            to="/settings/providers/new"
          >
            <CardListContent
              title={t('settings.add_provider')}
              description={t('settings.add_provider_desc')}
            />
          </CardListItem>
        </CardList>
      )}

      {systemAccounts.length > 0 && (
        <section className="providers-page-system">
          <h2>{t('settings.system_integrations')}</h2>
          <p>{t('settings.system_integrations_desc')}</p>
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
