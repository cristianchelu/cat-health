import * as React from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Search, Settings } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { FormField, Select } from '@/components/ui/form';
import type { ProviderAccountDTO } from 'shared';
import { getFlow } from '../flows/registry';

interface SelectAccountStepProps {
  accounts: ProviderAccountDTO[];
  onContinue: (accountId: number) => void;
}

interface SelectAccountFormValues {
  accountId: string;
}

export const SelectAccountStep: React.FC<SelectAccountStepProps> = ({
  accounts,
  onContinue,
}) => {
  const { t } = useTranslation();
  const {
    register,
    handleSubmit,
    control,
    formState: { isValid },
  } = useForm<SelectAccountFormValues>({
    defaultValues: { accountId: '' },
    mode: 'onChange',
  });
  const selectedAccountId = useWatch({ control, name: 'accountId' });

  const selectedAccount = selectedAccountId
    ? accounts.find((a) => String(a.id) === selectedAccountId)
    : undefined;
  const skipsDiscovery = selectedAccount
    ? (getFlow(selectedAccount.provider).skipDiscovery ?? false)
    : false;

  const onSubmit = handleSubmit((data) => {
    onContinue(Number(data.accountId));
  });

  return (
    <form onSubmit={onSubmit} className="settings-form">
      <FormField label={t('settings.provider_account_label')}>
        <Select
          placeholder={t('settings.select_account_placeholder')}
          options={accounts.map((acc) => ({
            value: acc.id.toString(),
            label: `${acc.name} (${acc.provider})`,
          }))}
          {...register('accountId', { required: true })}
        />
      </FormField>

      <div className="form-actions">
        <Button type="submit" disabled={!isValid}>
          {skipsDiscovery ? <Settings size="1em" /> : <Search size="1em" />}
          {skipsDiscovery
            ? t('settings.configure_device')
            : t('settings.scan_devices')}
        </Button>
      </div>
    </form>
  );
};
