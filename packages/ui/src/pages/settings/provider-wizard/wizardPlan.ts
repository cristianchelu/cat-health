import type {
  ProviderAccountDTO,
  ProviderCapabilities,
  ProviderInfoDTO,
} from 'shared';
import type {
  RegisterSource,
  WizardEntry,
  WizardState,
  WizardStep,
} from './wizardTypes';

export interface WizardPlanStep {
  id: WizardStep;
  /** i18n key for the stepper label. */
  labelKey: string;
}

export interface WizardPlan {
  entry: WizardEntry;
  steps: WizardPlanStep[];
}

/** Add-device always has the same three steps; a source may skip the middle one. */
const ADD_DEVICE_STEPS: WizardPlanStep[] = [
  { id: 'pick', labelKey: 'settings.step_select_account' },
  { id: 'discover', labelKey: 'settings.step_discover_devices' },
  { id: 'register', labelKey: 'settings.step_register_device' },
];

/**
 * Build the step list for a flow.
 *
 * The two entries differ in kind, not just in content:
 *
 * `add-device` has a **fixed shape** — select, discover, register. A
 * skip-discovery source doesn't shorten the flow, it jumps over the middle
 * step, which the Stepper then renders as completed. The plan is known from
 * the start, so the stepper is visible immediately and keeps its 1-2-3
 * orientation on the screen where it matters most.
 *
 * `connect` has a **variable shape**: whether there are devices to import or
 * pets to link is a property of the chosen provider, so the length genuinely
 * differs and cannot be known before the pick. It returns `null` until then,
 * and the caller renders no stepper rather than promising a count it may not
 * honour:
 *
 *   discovery + linking   pick > connect > discover > link-pets
 *   discovery only        pick > connect > discover
 *   linking only          pick > connect > link-pets
 *   neither               pick > connect
 *
 * Discovery is gated on `supports_discovery` being explicitly true, not on
 * `skip_discovery` being absent: a provider that declares neither flag has not
 * claimed it can discover anything, and offering the step anyway strands the
 * user on an empty result with no way forward.
 *
 * Branching is on capabilities, never on provider name, per AGENTS.md.
 */
export function buildWizardPlan(
  entry: WizardEntry,
  capabilities: ProviderCapabilities | undefined,
): WizardPlan | null {
  if (entry === 'add-device') {
    return { entry, steps: ADD_DEVICE_STEPS };
  }

  if (!capabilities) return null;

  const steps: WizardPlanStep[] = [
    { id: 'pick', labelKey: 'settings.step_pick_provider' },
    { id: 'connect', labelKey: 'settings.step_connect' },
  ];

  if (capabilities.supports_discovery && !capabilities.skip_discovery) {
    steps.push({ id: 'discover', labelKey: 'settings.step_discover_devices' });
  }

  if (capabilities.supports_pet_linking) {
    steps.push({ id: 'link-pets', labelKey: 'settings.step_link_pets' });
  }

  return { entry, steps };
}

/**
 * The step that follows choosing an account in `add-device`.
 *
 * Branches on the same capability the plan does, so navigation can never skip a
 * discovery step the stepper promised.
 */
export function stepAfterAccountPick(
  account: ProviderAccountDTO,
  providers: ProviderInfoDTO[],
): WizardState {
  const skipsDiscovery =
    providers.find((p) => p.name === account.provider)?.capabilities
      .skip_discovery ?? false;

  return skipsDiscovery
    ? {
        step: 'register',
        accountId: account.id,
        source: { kind: 'skip-discovery' },
      }
    : { step: 'discover', accountId: account.id };
}

/**
 * Where an `add-device` wizard opens.
 *
 * Arriving from a provider account has already answered "which account?", so
 * asking again on the pick step reads as the app having forgotten where the user
 * came from. A seeded account lands on the step the picker would have sent them
 * to anyway.
 *
 * The seed is held to the same bar the picker applies, and falls back to the
 * picker rather than trusting it: an account that doesn't exist, is switched
 * off, or has no registered provider behind it has no manager to discover with,
 * so honouring it would strand the user on a step that can never resolve.
 */
export function initialAddDeviceState(
  accountId: number | null,
  accounts: ProviderAccountDTO[],
  providers: ProviderInfoDTO[],
): WizardState {
  if (accountId == null) return { step: 'pick' };

  const seeded = accounts.find((account) => account.id === accountId);
  if (!seeded?.enabled) return { step: 'pick' };
  if (!providers.some((p) => p.name === seeded.provider)) {
    return { step: 'pick' };
  }

  return stepAfterAccountPick(seeded, providers);
}

/** Whether the plan actually contains a step, so navigation can't skip one it promised. */
export function planHasStep(
  plan: WizardPlan | null,
  step: WizardStep,
): boolean {
  return plan?.steps.some((planStep) => planStep.id === step) ?? false;
}

/**
 * 1-based index for the Stepper.
 *
 * `register` is not a planned step in the connect flow — it's a detour off
 * discovery for providers that register one device at a time. Report it at
 * discovery's position rather than falling back to step 1, which would make the
 * stepper jump backwards mid-flow.
 */
export function getVisualStep(plan: WizardPlan, state: WizardState): number {
  const index = plan.steps.findIndex((step) => step.id === state.step);
  if (index !== -1) return index + 1;

  if (state.step === 'register') {
    const discoverIndex = plan.steps.findIndex((s) => s.id === 'discover');
    if (discoverIndex !== -1) return discoverIndex + 1;
  }

  return 1;
}

/**
 * Where the back control lands, or `'exit'` to leave the wizard.
 *
 * A `skip-discovery` source never passed through discovery, so backing out of
 * registration must skip it too rather than landing on a step the user never saw.
 *
 * Backing past `connect` is deliberately `'exit'`, not `pick`. By the time a
 * later step is on screen the account has already been created, and there is no
 * DELETE for provider accounts — returning to the picker would let the user fill
 * the credential form again and create a second, identical, permanently orphaned
 * account. The shell sends this `'exit'` to the account that was just created.
 */
export function getBackTarget(
  plan: WizardPlan | null,
  state: WizardState,
): WizardState | 'exit' {
  if (state.step === 'pick') return 'exit';

  if (state.step === 'register') {
    return registrationBackTarget(state.accountId, state.source);
  }

  if (!plan) return 'exit';

  const index = plan.steps.findIndex((step) => step.id === state.step);
  const previous = index > 0 ? plan.steps[index - 1] : undefined;
  if (!previous) return 'exit';

  switch (previous.id) {
    case 'pick':
      return { step: 'pick' };
    case 'connect':
      return 'exit';
    case 'discover':
      // Only reachable from a step that carries an account, but don't invent a
      // sentinel id if that ever stops being true — a discover step with
      // `accountId: 0` renders a permanently blank page.
      return 'accountId' in state
        ? { step: 'discover', accountId: state.accountId }
        : 'exit';
    default:
      return 'exit';
  }
}

/**
 * Label key for the step the back control lands on, or `null` when it leaves
 * the wizard entirely — the caller names that destination itself.
 *
 * The control says where it goes rather than "Back": it is the only step-back
 * the flow has, so on a mid-wizard step it has to read as walking the plan and
 * not as abandoning it.
 */
export function getBackTargetLabelKey(
  plan: WizardPlan | null,
  state: WizardState,
): string | null {
  const target = getBackTarget(plan, state);
  if (target === 'exit') return null;
  return plan?.steps.find((step) => step.id === target.step)?.labelKey ?? null;
}

function registrationBackTarget(
  accountId: number,
  source: RegisterSource,
): WizardState {
  return source.kind === 'skip-discovery'
    ? { step: 'pick' }
    : { step: 'discover', accountId };
}

/**
 * Stable identity for a register source. Used as a React key so provider form
 * state resets when the user picks a different discovered device or switches
 * between discovery and direct entry.
 */
export function sourceKey(source: RegisterSource): string {
  switch (source.kind) {
    case 'discovery':
      return `discovery:${source.device.externalId}`;
    case 'direct':
      return 'direct';
    case 'skip-discovery':
      return 'skip-discovery';
  }
}
