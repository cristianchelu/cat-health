import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Info, Search, Settings } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import type { ProviderAccountDTO } from 'shared';
import { useProviders, useDevices } from '@/hooks/queries/deviceQueries';
import { countDevicesByAccount } from '../../providers/providerListUtils.ts';
import { getProviderBrand } from '../flows/providerBrandRegistry.ts';
import {
  ProviderPickerList,
  type PickerGroup,
  type PickerOption,
} from '../components/ProviderPickerList';

interface SelectAccountStepProps {
  accounts: ProviderAccountDTO[];
  onContinue: (accountId: number) => void;
}

/**
 * Choose which account a new device arrives through.
 *
 * Devices don't stand alone — they come in via a provider — so this step makes
 * the source explicit, and points at Providers when the account you need isn't
 * connected yet.
 */
export const SelectAccountStep: React.FC<SelectAccountStepProps> = ({
  accounts,
  onContinue,
}) => {
  const { t } = useTranslation();
  const { data: providers = [] } = useProviders();
  const { data: devices = [] } = useDevices();
  const [selected, setSelected] = React.useState<string | null>(null);

  const deviceCounts = React.useMemo(
    () => countDevicesByAccount(devices),
    [devices],
  );

  const toOption = (account: ProviderAccountDTO): PickerOption => {
    const brand = getProviderBrand(account.provider);
    const identity = brand.accountIdentity?.(account.config);
    const count = deviceCounts.get(account.id) ?? 0;
    return {
      value: String(account.id),
      title: account.name,
      provider: account.provider,
      meta: [identity, t('settings.device_count', { count })]
        .filter(Boolean)
        .join(' · '),
    };
  };

  /*
   * An account whose provider isn't registered has no manager behind it, so
   * discovery would fail outright — that's the seeded "Legacy Devices" row.
   * Disabled accounts are excluded for the same reason.
   */
  const usable = accounts.filter(
    (account) =>
      account.enabled && providers.some((p) => p.name === account.provider),
  );

  const cloudAccounts = usable.filter((a) => !a.internal);
  // Internal providers are how local hardware is added — a camera or an
  // ESPHome node has no cloud account behind it.
  const localAccounts = usable.filter((a) => a.internal);

  const groups: PickerGroup[] = [];
  if (cloudAccounts.length > 0) {
    groups.push({
      label: t('settings.your_connected_providers'),
      options: cloudAccounts.map(toOption),
    });
  }
  if (localAccounts.length > 0) {
    groups.push({
      label: t('settings.add_without_cloud_account'),
      options: localAccounts.map(toOption),
    });
  }

  const selectedAccount = usable.find((a) => String(a.id) === selected);
  const skipsDiscovery = selectedAccount
    ? (providers.find((p) => p.name === selectedAccount.provider)?.capabilities
        .skip_discovery ?? false)
    : false;

  return (
    <div className="connect-provider-step">
      <h1>{t('settings.select_account_title')}</h1>
      <p className="connect-provider-subtitle">
        {t('settings.select_account_subtitle')}
      </p>

      <ProviderPickerList
        legend={t('settings.select_account_title')}
        groups={groups}
        value={selected}
        onChange={setSelected}
      />

      <p className="provider-note info">
        <Info size={18} aria-hidden="true" />
        <span>
          {t('settings.provider_missing_hint')}{' '}
          <Link to="/settings/providers">{t('settings.providers')}</Link>
        </span>
      </p>

      <div className="connect-provider-actions">
        <Button
          type="button"
          disabled={!selectedAccount}
          onClick={() => selectedAccount && onContinue(selectedAccount.id)}
        >
          {skipsDiscovery ? <Settings size="1em" /> : <Search size="1em" />}
          {skipsDiscovery
            ? t('settings.configure_device')
            : t('settings.scan_devices')}
        </Button>
      </div>
    </div>
  );
};
