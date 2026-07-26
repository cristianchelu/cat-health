import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { useProviders } from '@/hooks/queries/deviceQueries';
import { getProviderBrand } from '../flows/providerBrandRegistry.ts';
import { hasAccountConfigModule } from '../flows/accountConfigRegistry.ts';
import { ProviderPickerList } from '../components/ProviderPickerList';

interface PickProviderStepProps {
  value: string | null;
  onChange: (provider: string) => void;
  onContinue: () => void;
  onCancel: () => void;
}

/**
 * Choose which provider to connect.
 *
 * No stepper is rendered here or by the caller: how many steps the flow has
 * depends on the chosen provider's capabilities, so the count is unknowable
 * until this step is done.
 */
export const PickProviderStep: React.FC<PickProviderStepProps> = ({
  value,
  onChange,
  onContinue,
  onCancel,
}) => {
  const { t } = useTranslation();
  const { data: providers = [] } = useProviders();

  // Internal providers are not user-addable, and a provider with no connect
  // form has nothing to ask for — there is no raw-JSON path any more.
  const options = providers
    .filter((p) => !p.internal && hasAccountConfigModule(p.name))
    .map((p) => ({
      value: p.name,
      title: getProviderBrand(p.name).label,
      provider: p.name,
    }));

  return (
    <div className="connect-provider-step">
      <h1>{t('settings.pick_provider_title')}</h1>
      <p className="connect-provider-subtitle">
        {t('settings.pick_provider_subtitle')}
      </p>

      <ProviderPickerList
        legend={t('settings.pick_provider_title')}
        groups={[{ options }]}
        value={value}
        onChange={onChange}
      />

      <div className="connect-provider-actions">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('settings.cancel')}
        </Button>
        <Button type="button" onClick={onContinue} disabled={!value}>
          {t('settings.continue')}
        </Button>
      </div>
    </div>
  );
};
