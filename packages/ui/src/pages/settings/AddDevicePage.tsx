import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { DiscoveredDeviceDTO, PostDeviceRequestDTO } from 'shared';
import {
  useProviderAccounts,
  useDiscoverDevices,
  useAddDevice,
  useDevices,
} from '@/hooks/queries/deviceQueries';
import { SectionHeader } from '@/components/ui/SectionHeader';
import Stepper from '@/components/ui/Stepper';
import { SelectAccountStep } from './add-device/steps/SelectAccountStep';
import { DiscoverDevicesStep } from './add-device/steps/DiscoverDevicesStep';
import { getFlow } from './add-device/flows/registry';
import type { WizardState } from './add-device/wizardTypes';
import {
  getRegistrationBackPhase,
  getVisualStep,
  sourceKey,
} from './add-device/wizardUtils';
import './AddDevicePage.css';

const AddDevicePage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: accounts = [] } = useProviderAccounts();
  const { data: existingDevices = [] } = useDevices();
  const addDevice = useAddDevice();

  const [state, setState] = useState<WizardState>({ phase: 'account' });
  const [serverError, setServerError] = useState<string | null>(null);

  const activeAccountId = state.phase === 'account' ? null : state.accountId;
  const selectedAccount = accounts.find((a) => a.id === activeAccountId);
  const flow = selectedAccount ? getFlow(selectedAccount.provider) : null;

  const {
    data: discoveredDevices,
    isLoading,
    isRefetching,
    refetch: refetchDiscovery,
  } = useDiscoverDevices(
    state.phase === 'account' ? null : state.accountId,
    { enabled: state.phase === 'discover' },
  );

  const STEPS = [
    { label: t('settings.step_select_account') },
    { label: t('settings.step_discover_devices') },
    { label: t('settings.step_register_device') },
  ];

  const handleContinueFromAccount = (accountId: number) => {
    const account = accounts.find((a) => a.id === accountId);
    if (!account) return;
    const accountFlow = getFlow(account.provider);
    setServerError(null);
    if (accountFlow.skipDiscovery) {
      setState({
        phase: 'register',
        accountId,
        source: { kind: 'skip-discovery' },
      });
    } else {
      setState({ phase: 'discover', accountId });
    }
  };

  const handleSelectDiscovered = (device: DiscoveredDeviceDTO) => {
    if (state.phase !== 'discover') return;
    setServerError(null);
    setState({
      phase: 'register',
      accountId: state.accountId,
      source: { kind: 'discovery', device },
    });
  };

  const handleDirectRegister = () => {
    if (state.phase !== 'discover') return;
    setServerError(null);
    setState({
      phase: 'register',
      accountId: state.accountId,
      source: { kind: 'direct' },
    });
  };

  const handleRegisterBack = () => {
    if (state.phase !== 'register') return;
    setServerError(null);
    const target = getRegistrationBackPhase(state.source);
    if (target === 'account') {
      setState({ phase: 'account' });
    } else {
      setState({ phase: 'discover', accountId: state.accountId });
    }
  };

  const handleDiscoverBack = () => {
    setServerError(null);
    setState({ phase: 'account' });
  };

  const handleCancel = () => navigate('/settings');

  const submitDevice = async (payload: PostDeviceRequestDTO) => {
    try {
      setServerError(null);
      await addDevice.mutateAsync(payload);
      navigate('/settings');
    } catch (err) {
      console.error(err);
      setServerError(t('settings.register_device_error'));
    }
  };

  return (
    <div className="add-device-page">
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

      <Stepper steps={STEPS} currentStep={getVisualStep(state)} />

      {state.phase === 'account' && (
        <div className="step-container">
          <SelectAccountStep
            accounts={accounts}
            onContinue={handleContinueFromAccount}
          />
        </div>
      )}

      {state.phase === 'discover' && flow && (
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
            onRescan={() => refetchDiscovery()}
            onBack={handleDiscoverBack}
          />
        </div>
      )}

      {state.phase === 'register' && flow && selectedAccount && (
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
            onBack={handleRegisterBack}
          />
        </div>
      )}
    </div>
  );
};

export default AddDevicePage;
