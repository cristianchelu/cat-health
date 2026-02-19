import React, { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
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
import { Server, Eye, EyeOff } from 'lucide-react';
import './AddEditProviderPage.css';

const MIN_API_KEY_LENGTH = 10;

function isValidHttpUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

interface ProviderFormValues {
  provider: string;
  name: string;
  enabled: boolean;
  config: string;
  apiKey: string;
  baseUrl: string;
}

const DEFAULT_FORM_VALUES: ProviderFormValues = {
  provider: '',
  name: '',
  enabled: true,
  config: '{}',
  apiKey: '',
  baseUrl: 'https://openrouter.ai/api/v1',
};

function accountToFormValues(account: {
  provider: string;
  name: string;
  enabled: boolean;
  config?: unknown;
}): ProviderFormValues {
  const cfg = account.config as Record<string, unknown> | undefined;
  if (account.provider === 'inference' && cfg) {
    return {
      provider: account.provider,
      name: account.name,
      enabled: account.enabled,
      config: '{}',
      apiKey: (cfg.api_key as string) || '',
      baseUrl: (cfg.base_url as string) || 'https://openrouter.ai/api/v1',
    };
  }
  return {
    provider: account.provider,
    name: account.name,
    enabled: account.enabled,
    config:
      typeof cfg === 'object' && cfg !== null
        ? JSON.stringify(cfg, null, 2)
        : '{}',
    apiKey: '',
    baseUrl: 'https://openrouter.ai/api/v1',
  };
}

const AddEditProviderPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);
  const accountId = parseInt(id || '0', 10);

  const { data: providers = [] } = useProviders();
  const { data: account, isLoading, error: loadError } = useProviderAccount(
    accountId,
    isEditing,
  );
  const createAccount = useCreateProviderAccount();
  const updateAccount = useUpdateProviderAccount(accountId);

  const providerOptions = providers
    .filter((p) => !p.internal)
    .map((p) => ({ value: p.name, label: p.name }));

  const {
    register,
    handleSubmit,
    watch,
    control,
    setError,
    formState: { errors },
  } = useForm<ProviderFormValues>({
    defaultValues: DEFAULT_FORM_VALUES,
    values: account ? accountToFormValues(account) : undefined,
  });

  const [error, setErrorState] = useState<string | undefined>(undefined);
  const [showApiKey, setShowApiKey] = useState(false);

  // eslint-disable-next-line react-hooks/incompatible-library -- RHF watch() for conditional provider config UI
  const provider = watch('provider');

  const onFormSubmit = async (data: ProviderFormValues) => {
    setErrorState(undefined);
    setError('apiKey', { message: '' });
    setError('baseUrl', { message: '' });

    try {
      if (data.provider === 'inference') {
        const trimmedApiKey = data.apiKey.trim();
        if (!trimmedApiKey) {
          setError('apiKey', {
            message: t('settings.inference_api_key_required'),
          });
          return;
        }
        if (trimmedApiKey.length < MIN_API_KEY_LENGTH) {
          setError('apiKey', {
            message: t('settings.inference_api_key_invalid'),
          });
          return;
        }
        const trimmedBaseUrl = data.baseUrl.trim();
        if (!trimmedBaseUrl) {
          setError('baseUrl', {
            message: t('settings.inference_base_url_required'),
          });
          return;
        }
        if (!isValidHttpUrl(trimmedBaseUrl)) {
          setError('baseUrl', {
            message: t('settings.inference_base_url_invalid'),
          });
          return;
        }
      } else {
        try {
          JSON.parse(data.config);
        } catch {
          setError('config', { message: t('settings.invalid_json') });
          return;
        }
      }

      const parsedConfig =
        data.provider === 'inference'
          ? {
              api_key: data.apiKey.trim(),
              base_url: data.baseUrl.trim(),
            }
          : (JSON.parse(data.config) as Record<string, unknown>);

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
        <div className="loading-state">{t('settings.loading_provider_data')}</div>
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
              <span>{watch('enabled') ? t('settings.enabled') : t('settings.disabled')}</span>
            </div>
          </FormField>
        )}

        {provider === 'inference' ? (
          <>
            <FormField
              label={t('settings.inference_api_key_label')}
              error={errors.apiKey?.message}
            >
              <div className="api-key-field">
                <Input
                  type={showApiKey ? 'text' : 'password'}
                  {...register('apiKey')}
                  placeholder={t('settings.inference_api_key_placeholder')}
                  className="api-key-input"
                  variant={errors.apiKey ? 'error' : 'default'}
                  aria-invalid={!!errors.apiKey}
                />
                <button
                  type="button"
                  className="api-key-toggle"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </FormField>

            <FormField
              label={t('settings.inference_base_url_label')}
              error={errors.baseUrl?.message}
            >
              <Input
                type="text"
                {...register('baseUrl', { required: true })}
                placeholder={t('settings.inference_base_url_placeholder')}
                variant={errors.baseUrl ? 'error' : 'default'}
                aria-invalid={!!errors.baseUrl}
              />
            </FormField>
          </>
        ) : (
          <FormField
            label={t('settings.config_label')}
            error={errors.config?.message}
          >
            <Textarea
              {...register('config')}
              rows={5}
              className="font-mono"
              variant={errors.config ? 'error' : 'default'}
            />
          </FormField>
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
