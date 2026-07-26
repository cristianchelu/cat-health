import type { ProviderCapabilities } from 'shared';
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
 *   skip_discovery        pick > connect
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

  if (!capabilities.skip_discovery) {
    steps.push({ id: 'discover', labelKey: 'settings.step_discover_devices' });
  }

  if (capabilities.supports_pet_linking) {
    steps.push({ id: 'link-pets', labelKey: 'settings.step_link_pets' });
  }

  return { entry, steps };
}

/** 1-based index for the Stepper. Falls back to the first step when unknown. */
export function getVisualStep(plan: WizardPlan, state: WizardState): number {
  const index = plan.steps.findIndex((step) => step.id === state.step);
  return index === -1 ? 1 : index + 1;
}

/**
 * Where the back control lands, or `'exit'` to leave the wizard.
 *
 * A `skip-discovery` source never passed through discovery, so backing out of
 * registration must skip it too rather than landing on a step the user never saw.
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
      // The provider is implied by the account we just created; the shell
      // re-derives it, so `pick` is the honest destination here.
      return { step: 'pick' };
    case 'discover':
      return {
        step: 'discover',
        accountId: 'accountId' in state ? state.accountId : 0,
      };
    default:
      return 'exit';
  }
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
