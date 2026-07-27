import type {
  DeviceType,
  DiscoveredDeviceDTO,
  GetDeviceResponseDTO,
} from 'shared';
import { isAlreadyAdded } from './wizardUtils';

/**
 * Why a discovered device cannot be imported.
 *
 * Kept distinct rather than a boolean so the UI can say which it is —
 * "already added" and "unsupported" mean very different things to a user
 * wondering why a device they own is greyed out.
 */
export type DisabledReason = 'already-added' | 'unsupported';

export interface DiscoveryCandidate {
  device: DiscoveredDeviceDTO;
  /** Undefined when the device can be imported. */
  disabledReason?: DisabledReason;
}

/**
 * Annotate discovered devices with whether they can be imported.
 *
 * Unsupported hardware is described rather than hidden: silently dropping a
 * device the user can see in the vendor's own app reads as a bug.
 *
 * `externalId` is deduplicated (first occurrence wins) because it is the row
 * identity downstream: a provider echoing the same device twice would otherwise
 * produce duplicate React keys and a single toggle flipping both rows.
 */
export function describeCandidates(
  discovered: DiscoveredDeviceDTO[],
  existingDevices: GetDeviceResponseDTO[],
  accountId: number,
  supportedTypes: readonly DeviceType[],
): DiscoveryCandidate[] {
  const supported = new Set(supportedTypes);
  const seen = new Set<string>();
  const candidates: DiscoveryCandidate[] = [];

  for (const device of discovered) {
    if (seen.has(device.externalId)) continue;
    seen.add(device.externalId);

    if (isAlreadyAdded(existingDevices, accountId, device)) {
      // Checked first: a device already imported is not interesting to the
      // user even if its type also happens to be unsupported.
      candidates.push({ device, disabledReason: 'already-added' });
    } else if (!supported.has(device.type)) {
      candidates.push({ device, disabledReason: 'unsupported' });
    } else {
      candidates.push({ device });
    }
  }

  return candidates;
}

export interface ImportOutcome {
  device: DiscoveredDeviceDTO;
  ok: boolean;
  error?: unknown;
}

/**
 * Import selected devices one at a time.
 *
 * Sequential on purpose: each POST triggers provider-side device registration
 * hooks, and a handful of concurrent cloud round-trips on a Raspberry Pi is
 * worse than doing them in order. It also means a single failure is reportable
 * as "3 of 5 imported" instead of one opaque rejection.
 */
export async function importDevices<T>(
  devices: DiscoveredDeviceDTO[],
  submit: (device: DiscoveredDeviceDTO) => Promise<T>,
): Promise<ImportOutcome[]> {
  const outcomes: ImportOutcome[] = [];
  for (const device of devices) {
    try {
      await submit(device);
      outcomes.push({ device, ok: true });
    } catch (error) {
      outcomes.push({ device, ok: false, error });
    }
  }
  return outcomes;
}
