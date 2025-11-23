import React, { useState } from 'react';
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
  const navigate = useNavigate();
  const { data: providers = [] } = useProviders();
  const createAccount = useCreateProviderAccount();

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
        setError('Invalid JSON configuration');
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
      setError('Failed to create provider account');
    }
  };

  return (
    <div className="add-edit-provider-page">
      <SectionHeader icon={<Server size="1em" />}>
        Add Provider Account
      </SectionHeader>

      <form onSubmit={handleSubmit} className="settings-form">
        <FormField label="Provider">
          <Select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            required
            placeholder="Select a provider"
            options={providers.map((p) => ({ value: p, label: p }))}
          />
        </FormField>

        <FormField label="Account Name">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Home Assistant"
            required
          />
        </FormField>

        <FormField label="Configuration (JSON)">
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
            Cancel
          </Button>
          <Button type="submit" disabled={createAccount.isPending}>
            {createAccount.isPending ? 'Creating...' : 'Create Account'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default AddEditProviderPage;
