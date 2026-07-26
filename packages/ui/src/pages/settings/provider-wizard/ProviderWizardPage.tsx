import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import type {
  DiscoveredDeviceDTO,
  PostDeviceRequestDTO,
  ProviderPetLink,
} from 'shared';
import {
  useProviders,
  useProviderAccounts,
  useProviderAccount,
  useDiscoverDevices,
  useAddDevice,
  useCreateProviderAccount,
  useUpdateProviderAccount,
  useDevices,
} from '@/hooks/queries/deviceQueries';
import { Server, Smartphone } from 'lucide-react';
import { PageBackLink } from '@/components/ui/PageBackLink';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { DiscardUnsavedDialog } from '@/components/ui/DiscardUnsavedDialog';
import Stepper from '@/components/ui/Stepper';
import { PickProviderStep } from './steps/PickProviderStep';
import { ConnectProviderStep } from './steps/ConnectProviderStep';
import { SelectAccountStep } from './steps/SelectAccountStep';
import { DiscoverDevicesStep } from './steps/DiscoverDevicesStep';
import { LinkPetsStep } from './steps/LinkPetsStep';
import { getFlow } from './flows/registry';
import type { WizardEntry, WizardState } from './wizardTypes';
import {
  buildWizardPlan,
  getBackTarget,
  getVisualStep,
  sourceKey,
} from './wizardPlan';
import { importDevices } from './importSelection';
import '../providerForm.css';
import './ProviderWizardPage.css';

interface ProviderWizardPageProps {
  entry: WizardEntry;
}

/**
 * Shared shell for both provider flows.
 *
 * `add-device` has a fixed three-step shape; a skip-discovery source jumps the
 * middle step, which the Stepper renders as completed.
 *
 * `connect` is sized to the chosen provider — a provider with nothing to
 * discover and no pets to link is a two-step flow — so no stepper is shown
 * until the pick is made. See wizardPlan.ts.
 */
const ProviderWizardPage: React.FC<ProviderWizardPageProps> = ({ entry }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: providers = [] } = useProviders();
  const { data: accounts = [] } = useProviderAccounts();
  const { data: existingDevices = [] } = useDevices();
  const addDevice = useAddDevice();
  const createAccount = useCreateProviderAccount();

  const [state, setState] = React.useState<WizardState>({ step: 'pick' });
  const [pickedProvider, setPickedProvider] = React.useState<string | null>(
    null,
  );
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [stepDirty, setStepDirty] = React.useState(false);
  const [discardOpen, setDiscardOpen] = React.useState(false);
  const [isImporting, setIsImporting] = React.useState(false);

  const activeAccountId = 'accountId' in state ? state.accountId : null;
  const selectedAccount = accounts.find((a) => a.id === activeAccountId);
  const updateAccount = useUpdateProviderAccount(activeAccountId ?? 0);
  // The freshly created account is not in the list query until it refetches.
  const { data: activeAccount } = useProviderAccount(
    activeAccountId ?? 0,
    entry === 'connect' && activeAccountId != null,
  );
  const account = activeAccount ?? selectedAccount;

  const activeProvider =
    entry === 'connect'
      ? (pickedProvider ?? account?.provider)
      : account?.provider;
  const capabilities = providers.find(
    (p) => p.name === activeProvider,
  )?.capabilities;
  const flow = account ? getFlow(account.provider) : null;

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

  /** Where a connect flow lands once its remaining steps are exhausted. */
  const finishConnect = React.useCallback(
    (accountId: number) => {
      void navigate(`/settings/providers/${accountId}`);
    },
    [navigate],
  );

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

  /**
   * The single back/exit control. On the first step it leaves the wizard; on
   * later steps it walks back through the plan. Guarded when the current step
   * holds unsaved input.
   */
  const handleCancel = () => {
    if (stepDirty) {
      setDiscardOpen(true);
      return;
    }
    goBack();
  };

  const title =
    entry === 'connect'
      ? t('settings.add_provider')
      : t('settings.add_device_title');

  /** Where back goes, so the label never lies about the destination. */
  const backLabel =
    plan && getVisualStep(plan, state) > 1
      ? t('settings.back')
      : entry === 'connect'
        ? t('settings.providers')
        : t('navigation.settings');

  /** Advance past a step that has no work left for the current provider. */
  const afterDiscovery = (accountId: number) => {
    if (capabilities?.supports_pet_linking) {
      setState({ step: 'link-pets', accountId });
    } else {
      finishConnect(accountId);
    }
  };

  const handleConnectSubmit = async (values: {
    name: string;
    config: Record<string, unknown>;
  }) => {
    if (!pickedProvider) return;
    setServerError(null);
    try {
      setStepDirty(false);
      const created = await createAccount.mutateAsync({
        provider: pickedProvider,
        name: values.name,
        config: values.config,
      });
      if (capabilities?.skip_discovery) {
        finishConnect(created.id);
        return;
      }
      setState({ step: 'discover', accountId: created.id });
    } catch (err) {
      console.error(err);
      setServerError(t('settings.create_provider_error'));
    }
  };

  const handleContinueFromAccount = (accountId: number) => {
    const picked = accounts.find((a) => a.id === accountId);
    if (!picked) return;
    setServerError(null);
    setStepDirty(false);
    // Branch on the same capability the step plan uses, so the stepper can
    // never promise a discovery step that navigation then skips.
    const skipsDiscovery =
      providers.find((p) => p.name === picked.provider)?.capabilities
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

  const handleImport = async (devices: DiscoveredDeviceDTO[]) => {
    if (
      state.step !== 'discover' ||
      !account ||
      !flow?.buildDeviceFromDiscovery
    )
      return;
    const build = flow.buildDeviceFromDiscovery;
    setServerError(null);
    setIsImporting(true);
    try {
      const outcomes = await importDevices(devices, (device) =>
        addDevice.mutateAsync(build(account, device)),
      );
      const imported = outcomes.filter((o) => o.ok).length;
      if (imported < devices.length) {
        setServerError(
          imported === 0
            ? t('settings.import_failed')
            : t('settings.import_partial_error', {
                imported,
                total: devices.length,
              }),
        );
        return;
      }
      afterDiscovery(state.accountId);
    } finally {
      setIsImporting(false);
    }
  };

  const handleFinishLinking = async (links: ProviderPetLink[]) => {
    if (state.step !== 'link-pets' || !account) return;
    setServerError(null);
    try {
      await updateAccount.mutateAsync({
        config: {
          ...(account.config as Record<string, unknown>),
          pet_links: links,
        },
      });
      finishConnect(state.accountId);
    } catch (err) {
      console.error(err);
      setServerError(t('settings.update_provider_error'));
    }
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

  const selectionMode = flow?.buildDeviceFromDiscovery ? 'multi' : 'single';

  return (
    <div className="provider-wizard-page">
      {/*
       * The only back/exit affordance in the wizard. A header Cancel plus a
       * footer Cancel plus this would be three ways to leave the same screen.
       */}
      <PageBackLink
        label={backLabel}
        mobileTitle={title}
        onNavigate={handleCancel}
      />

      <SectionHeader
        icon={
          entry === 'connect' ? (
            <Server size="1em" />
          ) : (
            <Smartphone size="1em" />
          )
        }
      >
        {title}
      </SectionHeader>

      {/*
       * Hidden on the first step in both flows: it would have nothing to say
       * there, and in the connect flow it would pop into existence once the
       * provider is known. From step 2 the first step reads as completed,
       * which communicates the same thing without the flicker.
       */}
      {plan && getVisualStep(plan, state) > 1 && (
        <Stepper
          steps={plan.steps.map((step) => ({ label: t(step.labelKey) }))}
          currentStep={getVisualStep(plan, state)}
        />
      )}

      {state.step === 'pick' && entry === 'connect' && (
        <div className="step-container">
          <PickProviderStep
            value={pickedProvider}
            onChange={setPickedProvider}
            onContinue={() =>
              pickedProvider &&
              setState({ step: 'connect', provider: pickedProvider })
            }
          />
        </div>
      )}

      {state.step === 'pick' && entry === 'add-device' && (
        <div className="step-container">
          <SelectAccountStep
            accounts={accounts}
            onContinue={handleContinueFromAccount}
            onDirtyChange={setStepDirty}
          />
        </div>
      )}

      {state.step === 'connect' && (
        <div className="step-container">
          <ConnectProviderStep
            key={state.provider}
            provider={state.provider}
            isSubmitting={createAccount.isPending}
            serverError={serverError ?? undefined}
            submitLabel={
              createAccount.isPending
                ? t('settings.creating')
                : t('settings.connect')
            }
            onSubmit={handleConnectSubmit}
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
            selectionMode={entry === 'connect' ? selectionMode : 'single'}
            isImporting={isImporting}
            importError={serverError}
            onSelect={handleSelectDiscovered}
            onImport={handleImport}
            onDirectRegister={handleDirectRegister}
            onRescan={() => void refetchDiscovery()}
            onBack={goBack}
            onSkip={
              entry === 'connect'
                ? () => afterDiscovery(state.accountId)
                : undefined
            }
          />
        </div>
      )}

      {state.step === 'register' && flow && account && (
        <div className="step-container">
          <flow.RegisterDeviceForm
            key={sourceKey(state.source)}
            account={account}
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

      {state.step === 'link-pets' && (
        <div className="step-container">
          <LinkPetsStep
            accountId={state.accountId}
            initialLinks={[]}
            isSaving={updateAccount.isPending}
            serverError={serverError}
            onFinish={handleFinishLinking}
            onBack={goBack}
            onSkip={() => finishConnect(state.accountId)}
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
