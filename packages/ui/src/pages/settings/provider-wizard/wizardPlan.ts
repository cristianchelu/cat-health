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

/**
 * Build the step list for a flow.
 *
 * Returns `null` while the choice that determines the shape hasn't been made
 * — on the `pick` step nothing is known yet, so the caller renders no stepper
 * at all rather than promising a step count it may not honour. Not every
 * provider has discovery or pet linking, so the length genuinely varies:
 *
 *   connect + discovery + linking   pick > connect > discover > link-pets
 *   connect + skip_discovery        pick > connect
 *   add-device + discovery          pick > discover > register
 *   add-device + skip_discovery     pick > register
 *
 * Branching is on capabilities, never on provider name, per AGENTS.md.
 */
export function buildWizardPlan(
  entry: WizardEntry,
  capabilities: ProviderCapabilities | undefined,
): WizardPlan | null {
  if (!capabilities) return null;

  const steps: WizardPlanStep[] = [
    {
      id: 'pick',
      labelKey:
        entry === 'connect'
          ? 'settings.step_pick_provider'
          : 'settings.step_select_account',
    },
  ];

  if (entry === 'connect') {
    steps.push({ id: 'connect', labelKey: 'settings.step_connect' });
  }

  if (!capabilities.skip_discovery) {
    steps.push({ id: 'discover', labelKey: 'settings.step_discover_devices' });
  }

  if (entry === 'add-device') {
    steps.push({ id: 'register', labelKey: 'settings.step_register_device' });
  } else if (capabilities.supports_pet_linking) {
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
