import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';
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
import { isRecord } from '@/lib/utils';
import { useUnsavedBlocker } from '@/hooks/form';
import { useBackNavigation } from '@/hooks/useBackNavigation';
import { AppHeader, AppHeaderBar } from '@/components/ui/AppHeader';
import { LoadingState } from '@/components/ui/PageState';
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
  getBackTargetLabelKey,
  getVisualStep,
  initialAddDeviceState,
  planHasStep,
  sourceKey,
  stepAfterAccountPick,
} from './wizardPlan';
import { importDevices } from './importSelection';
import './ProviderWizardPage.css';

interface ProviderWizardPageProps {
  entry: WizardEntry;
}

const EMPTY_PET_LINKS: ProviderPetLink[] = [];

/** The account an `add-device` link asked to start from, if it named a usable one. */
function readSeedAccountId(search: URLSearchParams): number | null {
  const raw = search.get('account');
  if (raw == null) return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function isProviderPetLink(value: unknown): value is ProviderPetLink {
  return (
    isRecord(value) &&
    typeof value.external_pet_id === 'string' &&
    typeof value.pet_id === 'number'
  );
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
  const [searchParams] = useSearchParams();
  const { data: providers = [], isPending: providersPending } = useProviders();
  const { data: accounts = [], isPending: accountsPending } =
    useProviderAccounts();
  const { data: existingDevices = [] } = useDevices();
  const addDevice = useAddDevice();
  const createAccount = useCreateProviderAccount();

  const seedAccountId =
    entry === 'add-device' ? readSeedAccountId(searchParams) : null;

  const leaveFallback =
    entry === 'connect'
      ? { to: '/settings/providers', label: t('settings.providers') }
      : { to: '/settings/devices', label: t('settings.devices') };
  const leave = useBackNavigation(leaveFallback);

  const [state, setState] = React.useState<WizardState>({ step: 'pick' });
  /*
   * A seed can only be resolved against the account and provider lists, which
   * arrive async, so the first render can't do it. Holding the picker back until
   * then keeps the user from seeing the question they already answered blink past
   * on its way to being skipped; it is read only on the pick step, so the moment
   * the seed resolves — or is rejected — this stops mattering.
   */
  const [seedPending, setSeedPending] = React.useState(seedAccountId != null);
  const [pickedProvider, setPickedProvider] = React.useState<string | null>(
    null,
  );
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [stepDirty, setStepDirty] = React.useState(false);
  const [pendingLeave, setPendingLeave] = React.useState<(() => void) | null>(
    null,
  );
  const [isImporting, setIsImporting] = React.useState(false);

  React.useEffect(() => {
    if (!seedPending || providersPending || accountsPending) return;
    setState(initialAddDeviceState(seedAccountId, accounts, providers));
    setSeedPending(false);
  }, [
    seedPending,
    providersPending,
    accountsPending,
    seedAccountId,
    accounts,
    providers,
  ]);

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

  /*
   * Normally empty — the connect flow creates the account moments earlier. It
   * matters when re-entering an account that already has links: the editor seeds
   * its auto-match from these, so a prior link keeps its local pet and metadata
   * instead of being re-guessed from the name.
   */
  const existingPetLinks = React.useMemo<ProviderPetLink[]>(() => {
    const config = account?.config;
    if (!isRecord(config) || !Array.isArray(config.pet_links)) {
      return EMPTY_PET_LINKS;
    }
    return config.pet_links.filter(isProviderPetLink);
  }, [account?.config]);

  const { blockerOpen, onConfirmLeave, onCancelLeave, markSaved } =
    useUnsavedBlocker(stepDirty);

  const {
    data: discoveredDevices,
    isLoading,
    isRefetching,
    refetch: refetchDiscovery,
  } = useDiscoverDevices(activeAccountId, {
    enabled: state.step === 'discover',
  });

  /*
   * Every deliberate way out of the wizard funnels through `exit` or
   * `finishConnect`, so both disarm the router blocker: the step's own
   * `requestLeave` confirm has already run where one was warranted, and
   * `setStepDirty(false)` would land a render too late to be seen by a
   * `navigate()` in the same tick.
   *
   * Abandon uses history-aware leave (pop, else replace onto the fallback).
   * Pushing the fallback left the wizard under that page, so its back control
   * bounced straight back in.
   */
  const exit = React.useCallback(() => {
    markSaved();
    leave.go();
  }, [markSaved, leave.go]);

  /** Where a connect flow lands once its remaining steps are exhausted. */
  const finishConnect = React.useCallback(
    (accountId: number) => {
      markSaved();
      // Replace so the wizard is not under the account page in history.
      void navigate(`/settings/providers/${accountId}`, { replace: true });
    },
    [markSaved, navigate],
  );

  /**
   * Abandon the wizard.
   *
   * Once the account exists, leaving lands on that account rather than the list:
   * it was created, it can't be deleted, and dropping the user on the index
   * makes a completed step look like it didn't happen.
   */
  const leaveWizard = React.useCallback(() => {
    if (entry === 'connect' && activeAccountId != null) {
      finishConnect(activeAccountId);
      return;
    }
    exit();
  }, [entry, activeAccountId, exit, finishConnect]);

  const goBackNow = () => {
    const target = getBackTarget(plan, state);
    setServerError(null);
    setStepDirty(false);
    if (target === 'exit') {
      leaveWizard();
      return;
    }
    setState(target);
  };

  /**
   * Every way of leaving the current step routes through here, so a step that
   * holds unsaved input always gets one confirm — and confirming goes where the
   * control the user actually clicked said it would, instead of always exiting.
   */
  const requestLeave = (proceed: () => void) => {
    if (stepDirty) {
      setPendingLeave(() => proceed);
      return;
    }
    proceed();
  };

  const goBack = () => requestLeave(goBackNow);

  /** Give up on the wizard from the commit row. */
  const abandon = () => requestLeave(leaveWizard);

  const title =
    entry === 'connect'
      ? t('settings.add_provider')
      : t('settings.add_device_title');

  /*
   * Navigation is not a form action, so the header control walks the plan and
   * the row keeps the two buttons every other form has (Form Actions spec, R3).
   * It is labelled with where it lands: the previous step mid-wizard, and the
   * page outside the wizard on the first one, where there is no step to go back
   * to and back is the way out.
   */
  const backLabelKey = getBackTargetLabelKey(plan, state);
  const backLabel = backLabelKey ? t(backLabelKey) : leave.label;

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
      const created = await createAccount.mutateAsync({
        provider: pickedProvider,
        name: values.name,
        config: values.config,
      });
      // Only once the credentials are safely persisted. Clearing it before the
      // await left a failed connect with the typed credentials still on screen
      // but the guard permanently off, so Back silently discarded them.
      setStepDirty(false);
      // Route through the plan rather than the raw flag, so a provider that
      // skips discovery but links pets still gets the step the stepper promised.
      if (!planHasStep(plan, 'discover')) {
        afterDiscovery(created.id);
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
    setState(stepAfterAccountPick(picked, providers));
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
          ...(isRecord(account.config) ? account.config : {}),
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
    <div className="page-shell-narrow page-provider-wizard">
      {/*
       * The wizard's only step-back, and its way out of the first step. Steps
       * carry Cancel (abandon) and their primary in the commit row instead.
       */}
      <AppHeader>
        <AppHeaderBar
          back={{ label: backLabel, onNavigate: goBack }}
          title={title}
        />
      </AppHeader>

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
          {seedPending ? (
            <LoadingState />
          ) : (
            <SelectAccountStep
              accounts={accounts}
              onContinue={handleContinueFromAccount}
            />
          )}
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
            onCancel={abandon}
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
            onCancel={abandon}
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
            onCancel={abandon}
            onDirtyChange={setStepDirty}
          />
        </div>
      )}

      {state.step === 'link-pets' && (
        <div className="step-container">
          <LinkPetsStep
            accountId={state.accountId}
            initialLinks={existingPetLinks}
            isSaving={updateAccount.isPending}
            serverError={serverError}
            onFinish={handleFinishLinking}
            onCancel={abandon}
            onSkip={() => finishConnect(state.accountId)}
            onDirtyChange={setStepDirty}
          />
        </div>
      )}

      <DiscardUnsavedDialog
        open={pendingLeave !== null}
        onConfirm={() => {
          const proceed = pendingLeave;
          setPendingLeave(null);
          setStepDirty(false);
          proceed?.();
        }}
        onCancel={() => setPendingLeave(null)}
      />

      {/* Router-level guard: the header control is not the only way out. */}
      <DiscardUnsavedDialog
        open={blockerOpen}
        onConfirm={onConfirmLeave}
        onCancel={onCancelLeave}
      />
    </div>
  );
};

export default ProviderWizardPage;
