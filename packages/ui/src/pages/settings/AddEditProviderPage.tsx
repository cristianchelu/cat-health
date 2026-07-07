import React, { useCallback, useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import type { ProviderPetLink } from 'shared';
import {
  useProviders,
  useProviderAccount,
  useCreateProviderAccount,
  useUpdateProviderAccount,
} from '@/hooks/queries/deviceQueries';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Button } from '@/components/ui/Button';
import { FormField, Input, Select, Textarea } from '@/components/ui/form';
import { Switch } from '@/components/ui/Switch';
import ProviderPetLinksEditor from './components/ProviderPetLinksEditor';
import { Server } from 'lucide-react';
import './AddEditProviderPage.css';

interface ProviderFormValues {
  provider: string;
  name: string;
  enabled: boolean;
  config: string;
}

const DEFAULT_FORM_VALUES: ProviderFormValues = {
  provider: '',
  name: '',
  enabled: true,
  config: '{}',
};

function configToJson(
  config: unknown,
  options?: { omitPetLinks?: boolean },
): string {
  if (typeof config !== 'object' || config === null) {
    return '{}';
  }
  if (options?.omitPetLinks) {
    const rest = { ...(config as Record<string, unknown>) };
    delete rest.pet_links;
    return JSON.stringify(rest, null, 2);
  }
  return JSON.stringify(config, null, 2);
}

function accountToFormValues(
  account: {
    provider: string;
    name: string;
    enabled: boolean;
    config?: unknown;
  },
  omitPetLinks: boolean,
): ProviderFormValues {
  return {
    provider: account.provider,
    name: account.name,
    enabled: account.enabled,
    config: configToJson(account.config, { omitPetLinks }),
  };
}

const AddEditProviderPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);
  const accountId = parseInt(id || '0', 10);

  const { data: providers = [] } = useProviders();
  const {
    data: account,
    isLoading,
    error: loadError,
  } = useProviderAccount(accountId, isEditing);
  const createAccount = useCreateProviderAccount();
  const updateAccount = useUpdateProviderAccount(accountId);

  const providerOptions = providers
    .filter((p) => !p.internal)
    .map((p) => ({ value: p.name, label: p.name }));

  const effectiveProvider = account?.provider;
  const providerMeta = effectiveProvider
    ? providers.find((p) => p.name === effectiveProvider)
    : undefined;
  const supportsPetLinking =
    providerMeta?.capabilities.supports_pet_linking ?? false;

  const {
    register,
    handleSubmit,
    watch,
    control,
    setError,
    formState: { errors },
  } = useForm<ProviderFormValues>({
    defaultValues: DEFAULT_FORM_VALUES,
    values:
      account && isEditing
        ? accountToFormValues(account, supportsPetLinking)
        : undefined,
  });

  const [error, setErrorState] = useState<string | undefined>(undefined);
  const [petLinks, setPetLinks] = useState<ProviderPetLink[]>([]);

  // eslint-disable-next-line react-hooks/incompatible-library -- RHF watch() for create flow provider select
  const selectedProvider = watch('provider');
  const createProviderMeta = providers.find((p) => p.name === selectedProvider);

  useEffect(() => {
    if (supportsPetLinking && account?.config) {
      const cfg = account.config as { pet_links?: ProviderPetLink[] };
      setPetLinks(Array.isArray(cfg.pet_links) ? cfg.pet_links : []);
    } else {
      setPetLinks([]);
    }
  }, [account, supportsPetLinking]);

  const handlePetLinksChange = useCallback((links: ProviderPetLink[]) => {
    setPetLinks(links);
  }, []);

  const showPetLinking = isEditing && accountId > 0 && supportsPetLinking;

  const onFormSubmit = async (data: ProviderFormValues) => {
    setErrorState(undefined);
    setError('config', { message: '' });

    let parsedConfig: Record<string, unknown>;
    try {
      parsedConfig = JSON.parse(data.config) as Record<string, unknown>;
    } catch {
      setError('config', { message: t('settings.invalid_json') });
      return;
    }

    if (showPetLinking) {
      parsedConfig.pet_links = petLinks;
    }

    try {
      if (isEditing) {
        await updateAccount.mutateAsync({
          name: data.name,
          config: parsedConfig,
          enabled: data.enabled,
        });
      } else {
        await createAccount.mutateAsync({
          provider: data.provider,
          name: data.name,
          config: parsedConfig,
        });
      }

      navigate('/settings');
    } catch (err) {
      console.error(err);
      setErrorState(
        isEditing
          ? t('settings.update_provider_error')
          : t('settings.create_provider_error'),
      );
    }
  };

  if (isEditing && isLoading) {
    return (
      <div className="add-edit-provider-page">
        <div className="loading-state">
          {t('settings.loading_provider_data')}
        </div>
      </div>
    );
  }

  if (isEditing && (loadError || !account)) {
    return (
      <div className="add-edit-provider-page">
        <div className="error-state">
          <p>{t('settings.error_loading_provider')}</p>
          <Button onClick={() => navigate('/settings')}>
            {t('settings.back')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="add-edit-provider-page">
      <SectionHeader icon={<Server size="1em" />}>
        {isEditing
          ? t('settings.edit_provider_title')
          : t('settings.add_provider_title')}
      </SectionHeader>

      <form onSubmit={handleSubmit(onFormSubmit)} className="settings-form">
        <FormField label={t('settings.provider_label')}>
          <Select
            {...register('provider', { required: true })}
            placeholder={t('settings.provider_placeholder')}
            options={providerOptions}
            disabled={isEditing}
          />
        </FormField>

        <FormField label={t('settings.account_name_label')}>
          <Input
            {...register('name', { required: true })}
            placeholder={t('settings.account_name_placeholder')}
          />
        </FormField>

        {isEditing && (
          <FormField label={t('settings.enabled')}>
            <div className="switch-row">
              <Controller
                name="enabled"
                control={control}
                render={({ field }) => (
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    ref={field.ref}
                  />
                )}
              />
              <span>
                {watch('enabled')
                  ? t('settings.enabled')
                  : t('settings.disabled')}
              </span>
            </div>
          </FormField>
        )}

        <FormField
          label={t('settings.config_label')}
          error={errors.config?.message}
        >
          <Textarea
            {...register('config')}
            rows={8}
            className="font-mono"
            variant={errors.config ? 'error' : 'default'}
          />
        </FormField>

        {!isEditing &&
          createProviderMeta?.capabilities.supports_pet_linking && (
            <p className="help-text">
              {t('settings.pet_linking_after_create_hint')}
            </p>
          )}

        {showPetLinking && (
          <ProviderPetLinksEditor
            key={accountId}
            accountId={accountId}
            initialLinks={petLinks}
            onChange={handlePetLinksChange}
          />
        )}

        {error && <div className="error-message">{error}</div>}

        <div className="form-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate('/settings')}
          >
            {t('settings.cancel')}
          </Button>
          <Button
            type="submit"
            disabled={createAccount.isPending || updateAccount.isPending}
          >
            {isEditing
              ? updateAccount.isPending
                ? t('settings.saving')
                : t('settings.save_changes')
              : createAccount.isPending
                ? t('settings.creating')
                : t('settings.create_account')}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default AddEditProviderPage;
