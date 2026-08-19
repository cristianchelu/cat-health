import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { cleanup, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DeviceListItemDTO } from 'shared';

import Devices from '../Devices.tsx';
import RegionalPreferencesProvider from '@/contexts/RegionalPreferencesProvider';
import { renderWithProviders } from '@/test/render.tsx';

const queryClients: QueryClient[] = [];

afterEach(() => {
  cleanup();
  for (const client of queryClients.splice(0)) {
    client.clear();
  }
});

function device(overrides: Partial<DeviceListItemDTO>): DeviceListItemDTO {
  return {
    id: 1,
    provider_account_id: 1,
    provider: 'esphome',
    external_id: 'ext-1',
    name: 'Hall litterbox',
    type: 'litterbox',
    config: null,
    enabled: true,
    account_enabled: true,
    last_seen: null,
    status: 'online',
    signals: [],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderRoster(devices: DeviceListItemDTO[]) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
    },
  });
  queryClients.push(client);
  client.setQueryData(['devices'], devices);

  return renderWithProviders(
    <QueryClientProvider client={client}>
      <RegionalPreferencesProvider>
        <Devices />
      </RegionalPreferencesProvider>
    </QueryClientProvider>,
    { router: { initialEntries: ['/devices'] } },
  );
}

describe('Devices roster empty state', () => {
  it('offers to add a first device when the user genuinely owns none', async () => {
    await renderRoster([]);

    assert.ok(screen.getByText(/add your first device/i));
  });

  it('still shows the roster while at least one device is on', async () => {
    await renderRoster([
      device({ id: 1, enabled: false }),
      device({ id: 2, name: 'Kitchen feeder', type: 'feeder' }),
    ]);

    assert.ok(screen.getByText('Kitchen feeder'));
  });

  it('says the devices are switched off rather than missing', async () => {
    await renderRoster([
      device({ id: 1, enabled: false }),
      device({ id: 2, name: 'Kitchen feeder', type: 'feeder', enabled: false }),
      device({
        id: 3,
        name: 'Orphan fountain',
        type: 'water_fountain',
        account_enabled: false,
      }),
    ]);

    assert.equal(screen.queryByText(/add your first device/i), null);
    assert.ok(screen.getByText(/switched off/i));
  });
});
