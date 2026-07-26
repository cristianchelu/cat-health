import type { DiscoveredDeviceDTO, GetDeviceResponseDTO } from 'shared';
import { isRecord } from '@/lib/utils';

/*
 * Step sequencing lives in wizardPlan.ts. This file holds the pure device
 * helpers, which are independent of how the wizard is navigated.
 */

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
