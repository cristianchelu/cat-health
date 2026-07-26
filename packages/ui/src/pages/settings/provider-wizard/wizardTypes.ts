import type { DiscoveredDeviceDTO } from 'shared';

export type RegisterSource =
  | { kind: 'discovery'; device: DiscoveredDeviceDTO }
  | { kind: 'direct' }
  | { kind: 'skip-discovery' };

export type WizardState =
  | { phase: 'account' }
  | { phase: 'discover'; accountId: number }
  | { phase: 'register'; accountId: number; source: RegisterSource };
