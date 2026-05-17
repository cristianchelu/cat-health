import type { DiscoveredDeviceDTO, GetDeviceResponseDTO } from 'shared';
import { isRecord } from '@/lib/utils';
import type { RegisterSource, WizardState } from './wizardTypes';

/** Visual step shown in the Stepper, derived from wizard phase. */
export function getVisualStep(state: WizardState): number {
  switch (state.phase) {
    case 'account':
      return 1;
    case 'discover':
      return 2;
    case 'register':
      return 3;
  }
}

/** Where the back button in the register phase should land. */
export function getRegistrationBackPhase(
  source: RegisterSource,
): 'account' | 'discover' {
  return source.kind === 'skip-discovery' ? 'account' : 'discover';
}

/**
 * Stable identity for a given register source. Used as a React key on the
 * provider form so internal field state resets when the user picks a different
 * discovered device or switches between discovery and direct entry.
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

/** Random external id for devices that we add without provider-side discovery. */
export function generateLocalExternalId(prefix: string): string {
  const random = Math.random().toString(36).substring(2, 9);
  return `${prefix}_${Date.now()}_${random}`;
}

/** True when an existing device already represents this discovered candidate. */
export function isAlreadyAdded(
  existingDevices: GetDeviceResponseDTO[],
  accountId: number,
  device: DiscoveredDeviceDTO,
): boolean {
  return existingDevices.some(
    (d) =>
      d.external_id === device.externalId &&
      d.provider_account_id === accountId,
  );
}

/**
 * Merge a discovered device's opaque config blob with provider-specific
 * overrides. Unknown shapes degrade to just the overrides rather than throwing.
 */
export function mergeDiscoveredConfig(
  prefillConfig: unknown,
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  const base = isRecord(prefillConfig) ? prefillConfig : {};
  return { ...base, ...overrides };
}
