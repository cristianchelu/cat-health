import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import type { DiscoveredDeviceDTO, PostDeviceRequestDTO } from 'shared';
import {
  useProviders,
  useProviderAccounts,
  useDiscoverDevices,
  useAddDevice,
  useDevices,
} from '@/hooks/queries/deviceQueries';
import { Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { DiscardUnsavedDialog } from '@/components/ui/DiscardUnsavedDialog';
import Stepper from '@/components/ui/Stepper';
import { SelectAccountStep } from './steps/SelectAccountStep';
import { DiscoverDevicesStep } from './steps/DiscoverDevicesStep';
import { getFlow } from './flows/registry';
import type { WizardEntry, WizardState } from './wizardTypes';
import {
  buildWizardPlan,
  getBackTarget,
  getVisualStep,
  sourceKey,
} from './wizardPlan';
import './ProviderWizardPage.css';

interface ProviderWizardPageProps {
  entry: WizardEntry;
}

/**
 * Shared shell for the provider flows.
 *
 * The stepper is deliberately absent on the first step: how many steps the
 * flow has depends on the chosen provider's capabilities, so the count is not
 * knowable until something has been picked. From then on it is sized to that
 * provider, with the pick shown as a completed first step.
 */
const ProviderWizardPage: React.FC<ProviderWizardPageProps> = ({ entry }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: providers = [] } = useProviders();
  const { data: accounts = [] } = useProviderAccounts();
  const { data: existingDevices = [] } = useDevices();
  const addDevice = useAddDevice();

  const [state, setState] = React.useState<WizardState>({ step: 'pick' });
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [stepDirty, setStepDirty] = React.useState(false);
  const [discardOpen, setDiscardOpen] = React.useState(false);

  const activeAccountId = 'accountId' in state ? state.accountId : null;
  const selectedAccount = accounts.find((a) => a.id === activeAccountId);
  const activeProvider =
    state.step === 'connect' ? state.provider : selectedAccount?.provider;
  const capabilities = providers.find(
    (p) => p.name === activeProvider,
  )?.capabilities;
  const flow = selectedAccount ? getFlow(selectedAccount.provider) : null;

  const plan = buildWizardPlan(entry, capabilities);

  const {
    data: discoveredDevices,
    isLoading,
    isRefetching,
    refetch: refetchDiscovery,
  } = useDiscoverDevices(activeAccountId, {
    enabled: state.step === 'discover',
  });

  const exit = React.useCallback(() => {
    void navigate(entry === 'connect' ? '/settings/providers' : '/settings');
  }, [entry, navigate]);

  const goBack = () => {
    const target = getBackTarget(plan, state);
    setServerError(null);
    setStepDirty(false);
    if (target === 'exit') {
      exit();
      return;
    }
    setState(target);
  };

  const handleCancel = () => {
    if (stepDirty) {
      setDiscardOpen(true);
      return;
    }
    exit();
  };

  const handleContinueFromAccount = (accountId: number) => {
    const account = accounts.find((a) => a.id === accountId);
    if (!account) return;
    setServerError(null);
    setStepDirty(false);
    // Branch on the same capability the step plan uses, so the stepper can
    // never promise a discovery step that navigation then skips.
    const skipsDiscovery =
      providers.find((p) => p.name === account.provider)?.capabilities
        .skip_discovery ?? false;
    setState(
      skipsDiscovery
        ? { step: 'register', accountId, source: { kind: 'skip-discovery' } }
        : { step: 'discover', accountId },
    );
  };

  const handleSelectDiscovered = (device: DiscoveredDeviceDTO) => {
    if (state.step !== 'discover') return;
    setServerError(null);
    setState({
      step: 'register',
      accountId: state.accountId,
      source: { kind: 'discovery', device },
    });
  };

  const handleDirectRegister = () => {
    if (state.step !== 'discover') return;
    setServerError(null);
    setState({
      step: 'register',
      accountId: state.accountId,
      source: { kind: 'direct' },
    });
  };

  const submitDevice = async (payload: PostDeviceRequestDTO) => {
    try {
      setServerError(null);
      await addDevice.mutateAsync(payload);
      exit();
    } catch (err) {
      console.error(err);
      setServerError(t('settings.register_device_error'));
    }
  };

  return (
    <div className="provider-wizard-page">
      <SectionHeader
        icon={<Smartphone size="1em" />}
        actions={
          <Button type="button" variant="secondary" onClick={handleCancel}>
            {t('settings.cancel')}
          </Button>
        }
      >
        {t('settings.add_device_title')}
      </SectionHeader>

      {plan && plan.steps.length > 1 && (
        <Stepper
          steps={plan.steps.map((step) => ({ label: t(step.labelKey) }))}
          currentStep={getVisualStep(plan, state)}
        />
      )}

      {state.step === 'pick' && (
        <div className="step-container">
          <SelectAccountStep
            accounts={accounts}
            onContinue={handleContinueFromAccount}
            onDirtyChange={setStepDirty}
          />
        </div>
      )}

      {state.step === 'discover' && flow && (
        <div className="step-container">
          <DiscoverDevicesStep
            accountId={state.accountId}
            isDiscovering={isLoading || isRefetching}
            discoveredDevices={discoveredDevices}
            existingDevices={existingDevices}
            supportedTypes={flow.supportedTypes}
            allowsDirectRegistration={flow.allowsDirectRegistration ?? false}
            onSelect={handleSelectDiscovered}
            onDirectRegister={handleDirectRegister}
            onRescan={() => void refetchDiscovery()}
            onBack={goBack}
          />
        </div>
      )}

      {state.step === 'register' && flow && selectedAccount && (
        <div className="step-container">
          <flow.RegisterDeviceForm
            key={sourceKey(state.source)}
            account={selectedAccount}
            prefill={
              state.source.kind === 'discovery' ? state.source.device : null
            }
            source={state.source}
            existingDevices={existingDevices}
            isSubmitting={addDevice.isPending}
            serverError={serverError}
            onSubmitDevice={submitDevice}
            onBack={goBack}
            onDirtyChange={setStepDirty}
          />
        </div>
      )}

      <DiscardUnsavedDialog
        open={discardOpen}
        onConfirm={() => {
          setDiscardOpen(false);
          setStepDirty(false);
          exit();
        }}
        onCancel={() => setDiscardOpen(false)}
      />
    </div>
  );
};

export default ProviderWizardPage;
