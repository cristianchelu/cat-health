import type { DiscoveredDeviceDTO } from 'shared';

export type RegisterSource =
  | { kind: 'discovery'; device: DiscoveredDeviceDTO }
  | { kind: 'direct' }
  | { kind: 'skip-discovery' };

/**
 * Which flow the wizard is running.
 *
 * `connect` starts from "which provider?" and produces an account.
 * `add-device` starts from "which account?" and produces a device.
 * Both share the shell, the stepper and the discovery step.
 */
export type WizardEntry = 'connect' | 'add-device';

export type WizardStep =
  | 'pick'
  | 'connect'
  | 'discover'
  | 'register'
  | 'link-pets';

export type WizardState =
  /** Choose a provider (connect) or an account (add-device). */
  | { step: 'pick' }
  | { step: 'connect'; provider: string }
  | { step: 'discover'; accountId: number }
  | { step: 'register'; accountId: number; source: RegisterSource }
  | { step: 'link-pets'; accountId: number };
