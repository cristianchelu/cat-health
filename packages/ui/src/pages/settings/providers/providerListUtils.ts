import type { GetDeviceResponseDTO } from 'shared';

/**
 * Devices per provider account, keyed by `provider_account_id`.
 *
 * Derived client-side from the already-cached device list rather than asking
 * the API for a count — every device DTO carries its account id.
 *
 * Accounts with no devices are absent from the map; callers default to 0. That
 * keeps "0 devices" visible in the listing, which is exactly the signal you
 * want for an account whose connect flow was abandoned partway.
 *
 * Takes only the field it reads, so tests can build rows without inventing a
 * whole device DTO (or casting one into existence).
 */
export function countDevicesByAccount(
  devices: ReadonlyArray<Pick<GetDeviceResponseDTO, 'provider_account_id'>>,
): Map<number, number> {
  const counts = new Map<number, number>();
  for (const device of devices) {
    const accountId = device.provider_account_id;
    counts.set(accountId, (counts.get(accountId) ?? 0) + 1);
  }
  return counts;
}
