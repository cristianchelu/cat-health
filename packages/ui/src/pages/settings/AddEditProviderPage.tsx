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
import { Server } from 'lucide-react';
import './AddEditProviderPage.css';

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
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      let parsedConfig = {};
      try {
        parsedConfig = JSON.parse(config);
      } catch {
        setError(t('settings.invalid_json'));
        return;
      }

      await createAccount.mutateAsync({
        provider,
        name,
        config: parsedConfig,
      });

      navigate('/settings/providers');
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

        <FormField label={t('settings.config_label')}>
          <Textarea
            value={config}
            onChange={(e) => setConfig(e.target.value)}
            rows={5}
            className="font-mono"
          />
        </FormField>

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
