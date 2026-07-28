import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { useProviders } from '@/hooks/queries/deviceQueries';
import {
  getProviderBrand,
  providerBrandLabel,
} from '../flows/providerBrandRegistry.ts';
import { hasAccountConfigModule } from '../flows/accountConfigRegistry.ts';
import { ProviderPickerList } from '../components/ProviderPickerList';

interface PickProviderStepProps {
  value: string | null;
  onChange: (provider: string) => void;
  onContinue: () => void;
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
}) => {
  const { t } = useTranslation();
  const { data: providers = [] } = useProviders();
  const headingId = React.useId();

  // Internal providers are not user-addable, and a provider with no connect
  // form has nothing to ask for — there is no raw-JSON path any more.
  const options = providers
    .filter((p) => !p.internal && hasAccountConfigModule(p.name))
    .map((p) => ({
      value: p.name,
      title: providerBrandLabel(getProviderBrand(p.name), t),
      provider: p.name,
    }));

  return (
    <div className="connect-provider-step">
      <h2 id={headingId}>{t('settings.pick_provider_title')}</h2>
      <p className="connect-provider-subtitle">
        {t('settings.pick_provider_subtitle')}
      </p>

      {/* The heading is the prompt; a legend would repeat it to a screen reader. */}
      <ProviderPickerList
        labelledBy={headingId}
        groups={[{ options }]}
        value={value}
        onChange={onChange}
      />

      {/* Back/exit lives in the wizard header; a Cancel here would duplicate it. */}
      <div className="connect-provider-actions">
        <Button type="button" onClick={onContinue} disabled={!value}>
          {t('settings.continue')}
        </Button>
      </div>
    </div>
  );
};
