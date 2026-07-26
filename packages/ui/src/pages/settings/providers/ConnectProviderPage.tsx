import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useCreateProviderAccount } from '@/hooks/queries/deviceQueries';
import { PageBackLink } from '@/components/ui/PageBackLink';
import { DiscardUnsavedDialog } from '@/components/ui/DiscardUnsavedDialog';
import { useUnsavedBlocker } from '@/hooks/form';
import { PickProviderStep } from '../provider-wizard/steps/PickProviderStep';
import { ConnectProviderStep } from '../provider-wizard/steps/ConnectProviderStep';
import '../providerForm.css';
import './ConnectProviderPage.css';

/**
 * Connect a new provider account: pick a provider, then fill in its branded
 * credential form.
 *
 * Phase 6 folds these two steps into the shared wizard shell (adding discovery
 * and pet linking for providers whose capabilities call for them), which is why
 * each half is already its own step component.
 */
const ConnectProviderPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const createAccount = useCreateProviderAccount();

  const [provider, setProvider] = React.useState<string | null>(null);
  const [confirmed, setConfirmed] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | undefined>();
  const [formDirty, setFormDirty] = React.useState(false);

  const { blockerOpen, onConfirmLeave, onCancelLeave } =
    useUnsavedBlocker(formDirty);

  const handleSubmit = async (values: {
    name: string;
    config: Record<string, unknown>;
  }) => {
    if (!provider) return;
    setServerError(undefined);
    try {
      setFormDirty(false);
      const account = await createAccount.mutateAsync({
        provider,
        name: values.name,
        config: values.config,
      });
      void navigate(`/settings/providers/${account.id}`);
    } catch (err) {
      console.error(err);
      setServerError(t('settings.create_provider_error'));
    }
  };

  return (
    <div className="connect-provider-page">
      <PageBackLink
        to="/settings/providers"
        label={t('settings.providers')}
        mobileTitle={t('settings.add_provider')}
      />

      {confirmed && provider ? (
        <ConnectProviderStep
          key={provider}
          provider={provider}
          isSubmitting={createAccount.isPending}
          serverError={serverError}
          submitLabel={
            createAccount.isPending
              ? t('settings.creating')
              : t('settings.connect')
          }
          onSubmit={handleSubmit}
          onBack={() => setConfirmed(false)}
          onDirtyChange={setFormDirty}
        />
      ) : (
        <PickProviderStep
          value={provider}
          onChange={setProvider}
          onContinue={() => setConfirmed(true)}
          onCancel={() => void navigate('/settings/providers')}
        />
      )}

      <DiscardUnsavedDialog
        open={blockerOpen}
        onConfirm={onConfirmLeave}
        onCancel={onCancelLeave}
      />
    </div>
  );
};

export default ConnectProviderPage;
