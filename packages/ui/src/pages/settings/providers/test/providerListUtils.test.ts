import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { GetDeviceResponseDTO } from 'shared';

import { countDevicesByAccount } from '../providerListUtils.ts';

/**
 * The helper only reads `provider_account_id`, so the fixture is a real
 * (structurally checked) slice of the DTO rather than a cast into existence.
 */
function device(
  provider_account_id: number,
): Pick<GetDeviceResponseDTO, 'provider_account_id'> {
  return { provider_account_id };
}

describe('countDevicesByAccount', () => {
  it('groups devices by their provider account', () => {
    const counts = countDevicesByAccount([device(10), device(10), device(20)]);

    assert.equal(counts.get(10), 2);
    assert.equal(counts.get(20), 1);
  });

  it('omits accounts with no devices so callers can default to zero', () => {
    const counts = countDevicesByAccount([device(10)]);

    assert.equal(counts.has(99), false);
    assert.equal(counts.get(99) ?? 0, 0);
  });

  it('counts disabled devices too', () => {
    const disabled = { ...device(10), enabled: false };
    const counts = countDevicesByAccount([disabled, device(10)]);

    assert.equal(counts.get(10), 2);
  });

  it('returns an empty map for no devices', () => {
    assert.equal(countDevicesByAccount([]).size, 0);
  });
});
