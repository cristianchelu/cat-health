import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { cleanup, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { GetDeviceResponseDTO } from 'shared';

import { DeviceHeader } from '../DeviceHeader.tsx';
import RegionalPreferencesProvider from '@/contexts/RegionalPreferencesProvider';
import { renderWithProviders } from '@/test/render.tsx';

const queryClients: QueryClient[] = [];

afterEach(() => {
  cleanup();
  for (const client of queryClients.splice(0)) {
    client.clear();
  }
});

function device(
  overrides: Partial<GetDeviceResponseDTO> = {},
): GetDeviceResponseDTO {
  return {
    id: 1,
    provider_account_id: 1,
    camera_link: null,
    recognition: null,
    provider: 'esphome',
    external_id: 'ext-1',
    name: 'Hall litterbox',
    type: 'litterbox',
    config: null,
    enabled: true,
    account_enabled: true,
    last_seen: '2026-08-16T10:00:00.000Z',
    status: 'online',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderHeader(value: GetDeviceResponseDTO) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
    },
  });
  queryClients.push(client);

  return renderWithProviders(
    <QueryClientProvider client={client}>
      <RegionalPreferencesProvider>
        <DeviceHeader device={value} />
      </RegionalPreferencesProvider>
    </QueryClientProvider>,
    { router: { initialEntries: ['/devices/1'] } },
  );
}

describe('DeviceHeader status pill', () => {
  it('shows connectivity for a device that is switched on', async () => {
    await renderHeader(device());

    assert.ok(screen.getByText('Online'));
    assert.equal(screen.queryByText('Disabled'), null);
  });

  /*
   * `mapDevice` freezes `status` at the last honest reading for a disabled
   * device, so without this the header keeps claiming "Online" for something
   * nothing has talked to since the switch was flipped. The device is still
   * reachable here by deep link from settings.
   */
  it('replaces connectivity with Disabled when the device is switched off', async () => {
    await renderHeader(device({ enabled: false }));

    assert.ok(screen.getByText('Disabled'));
    assert.equal(screen.queryByText('Online'), null);
  });

  it('names the account when that is the switch that is off', async () => {
    await renderHeader(device({ account_enabled: false }));

    assert.ok(screen.getByText('Account disabled'));
    assert.equal(screen.queryByText('Online'), null);
  });

  // Flipping this device's own switch back on would change nothing while its
  // account is off, so the account is the honest thing to name.
  it('names the account when both switches are off', async () => {
    await renderHeader(device({ enabled: false, account_enabled: false }));

    assert.ok(screen.getByText('Account disabled'));
  });
});
