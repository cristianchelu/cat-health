import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
  useProviders,
  useCreateProviderAccount,
} from '@/hooks/queries/deviceQueries';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Button } from '@/components/ui/Button';
import { FormField, Input, Select, Textarea } from '@/components/ui/form';
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

const AddEditProviderPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: providers = [] } = useProviders();
  const createAccount = useCreateProviderAccount();

  const providerOptions = providers
    .filter((p) => !p.internal)
    .map((p) => ({ value: p.name, label: p.name }));

  const [provider, setProvider] = useState('');
  const [name, setName] = useState('');
  const [config, setConfig] = useState('{}');
  const [error, setError] = useState<string | undefined>(undefined);

  // Inference-specific fields
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://openrouter.ai/api/v1');
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyError, setApiKeyError] = useState<string | undefined>(undefined);
  const [baseUrlError, setBaseUrlError] = useState<string | undefined>(undefined);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    setApiKeyError(undefined);
    setBaseUrlError(undefined);

    try {
      let parsedConfig = {};

      if (provider === 'inference') {
        // Validate API key: required, trimmed, minimum length
        const trimmedApiKey = apiKey.trim();
        if (!trimmedApiKey) {
          setApiKeyError(t('settings.inference_api_key_required'));
          return;
        }
        if (trimmedApiKey.length < MIN_API_KEY_LENGTH) {
          setApiKeyError(t('settings.inference_api_key_invalid'));
          return;
        }

        // Validate base URL: required, valid http(s) URL
        const trimmedBaseUrl = baseUrl.trim();
        if (!trimmedBaseUrl) {
          setBaseUrlError(t('settings.inference_base_url_required'));
          return;
        }
        if (!isValidHttpUrl(trimmedBaseUrl)) {
          setBaseUrlError(t('settings.inference_base_url_invalid'));
          return;
        }

        parsedConfig = {
          api_key: trimmedApiKey,
          base_url: trimmedBaseUrl,
        };
      } else {
        // Use JSON textarea for other providers
        try {
          parsedConfig = JSON.parse(config);
        } catch {
          setError(t('settings.invalid_json'));
          return;
        }
      }

      await createAccount.mutateAsync({
        provider,
        name,
        config: parsedConfig,
      });

      navigate('/settings');
    } catch (err) {
      console.error(err);
      setError(t('settings.create_provider_error'));
    }
  };

  return (
    <div className="add-edit-provider-page">
      <SectionHeader icon={<Server size="1em" />}>
        {t('settings.add_provider_title')}
      </SectionHeader>

      <form onSubmit={handleSubmit} className="settings-form">
        <FormField label={t('settings.provider_label')}>
          <Select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            required
            placeholder={t('settings.provider_placeholder')}
            options={providerOptions}
          />
        </FormField>

        <FormField label={t('settings.account_name_label')}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('settings.account_name_placeholder')}
            required
          />
        </FormField>

        {provider === 'inference' ? (
          <>
            <FormField
              label={t('settings.inference_api_key_label')}
              error={apiKeyError}
            >
              <div className="api-key-field">
                <Input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setApiKeyError(undefined);
                  }}
                  placeholder={t('settings.inference_api_key_placeholder')}
                  required
                  className="api-key-input"
                  variant={apiKeyError ? 'error' : 'default'}
                  aria-invalid={!!apiKeyError}
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
              error={baseUrlError}
            >
              <Input
                type="text"
                value={baseUrl}
                onChange={(e) => {
                  setBaseUrl(e.target.value);
                  setBaseUrlError(undefined);
                }}
                placeholder={t('settings.inference_base_url_placeholder')}
                required
                variant={baseUrlError ? 'error' : 'default'}
                aria-invalid={!!baseUrlError}
              />
            </FormField>
          </>
        ) : (
          <FormField label={t('settings.config_label')}>
            <Textarea
              value={config}
              onChange={(e) => setConfig(e.target.value)}
              rows={5}
              className="font-mono"
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
          <Button type="submit" disabled={createAccount.isPending}>
            {createAccount.isPending
              ? t('settings.creating')
              : t('settings.create_account')}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default AddEditProviderPage;
