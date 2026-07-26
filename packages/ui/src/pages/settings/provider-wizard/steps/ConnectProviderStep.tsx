import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Info } from 'lucide-react';
import { FormInput, FormShell } from '@/components/ui/form';
import { useAppForm } from '@/hooks/form';
import { ProviderBrandTile } from '../../providers/components/ProviderBrandTile';
import { getProviderBrand } from '../flows/providerBrandRegistry.ts';
import { getAccountConfigModule } from '../flows/accountConfigRegistry.ts';
import type { ProviderAccountFormValues } from '../flows/accountConfigTypes.ts';

interface ConnectProviderStepProps {
  provider: string;
  isSubmitting: boolean;
  serverError?: string;
  submitLabel: string;
  onSubmit: (values: {
    name: string;
    config: Record<string, unknown>;
  }) => Promise<void> | void;
  onBack: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * Branded credential form for one provider.
 *
 * The step owns the RHF instance and the FormShell; the provider module only
 * contributes its field block, so there is exactly one form, one dirty state
 * and one submit no matter which provider is selected.
 */
export const ConnectProviderStep: React.FC<ConnectProviderStepProps> = ({
  provider,
  isSubmitting,
  serverError,
  submitLabel,
  onSubmit,
  onBack,
  onDirtyChange,
}) => {
  const { t } = useTranslation();
  const brand = getProviderBrand(provider);
  const configModule = getAccountConfigModule(provider);
  const Fields = configModule.Fields;

  const {
    control,
    handleSubmit,
    formState: { isDirty },
  } = useAppForm<ProviderAccountFormValues>({
    defaultValues: {
      name: brand.label,
      enabled: true,
      config: configModule.defaultConfigValues,
    },
  });

  React.useEffect(() => {
    onDirtyChange?.(isDirty);
    return () => onDirtyChange?.(false);
  }, [isDirty, onDirtyChange]);

  return (
    <div className="connect-provider-step">
      <div className="provider-formcard">
        <header className="provider-brandhead">
          <ProviderBrandTile provider={provider} size="lg" />
          <div className="provider-brandhead-text">
            <h1>{t('settings.connect_provider_title', { provider: brand.label })}</h1>
            <p>{t('settings.connect_provider_subtitle')}</p>
          </div>
        </header>

        <FormShell
          onSubmit={handleSubmit((values) =>
            onSubmit({
              name: values.name,
              config: configModule.toConfig(values.config),
            }),
          )}
          error={serverError}
          actions={{
            onCancel: onBack,
            cancelLabel: t('settings.back'),
            submitLabel,
            isSubmitting,
          }}
        >
          <Fields control={control} mode="connect" />

          {configModule.note && (
            <p className={`provider-note ${configModule.note.variant}`}>
              {configModule.note.variant === 'warn' ? (
                <AlertTriangle size={18} aria-hidden="true" />
              ) : (
                <Info size={18} aria-hidden="true" />
              )}
              <span>{t(configModule.note.i18nKey)}</span>
            </p>
          )}

          <FormInput
            name="name"
            control={control}
            label={t('settings.account_name_label')}
            description={t('settings.account_name_hint')}
            placeholder={t('settings.account_name_placeholder')}
            rules={{ required: true }}
          />
        </FormShell>
      </div>
    </div>
  );
};
