import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { GetDeviceResponseDTO } from 'shared';

import { countDevicesByAccount } from '../providerListUtils.ts';

function device(
  id: number,
  provider_account_id: number,
): GetDeviceResponseDTO {
  return {
    id,
    provider_account_id,
    provider: 'surepet',
    external_id: `ext-${id}`,
    name: `Device ${id}`,
    type: 'feeder',
    config: null,
    enabled: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    last_seen: null,
    status: 'online',
  } as GetDeviceResponseDTO;
}

describe('countDevicesByAccount', () => {
  it('groups devices by their provider account', () => {
    const counts = countDevicesByAccount([
      device(1, 10),
      device(2, 10),
      device(3, 20),
    ]);

    assert.equal(counts.get(10), 2);
    assert.equal(counts.get(20), 1);
  });

  it('omits accounts with no devices so callers can default to zero', () => {
    const counts = countDevicesByAccount([device(1, 10)]);

    assert.equal(counts.has(99), false);
    assert.equal(counts.get(99) ?? 0, 0);
  });

  it('counts disabled devices too', () => {
    const disabled = { ...device(1, 10), enabled: false };
    const counts = countDevicesByAccount([disabled, device(2, 10)]);

    assert.equal(counts.get(10), 2);
  });

  it('returns an empty map for no devices', () => {
    assert.equal(countDevicesByAccount([]).size, 0);
  });
});
