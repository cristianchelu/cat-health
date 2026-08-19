import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import type { ReactElement } from 'react';
import { cleanup, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DeviceListItemDTO } from 'shared';

import DevicesPage from '../DevicesPage.tsx';
import RegionalPreferencesProvider from '@/contexts/RegionalPreferencesProvider';
import { renderWithProviders } from '@/test/render.tsx';

/*
 * `RegionalPreferencesProvider` pulls in the app's own i18n instance, so this
 * page renders real English copy rather than bare keys.
 */
const DISABLED_LABEL = 'Disabled';
const ACCOUNT_DISABLED_LABEL = 'Account disabled';

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
    name: 'Device',
    type: 'litterbox',
    config: null,
    enabled: true,
    account_enabled: true,
    last_seen: null,
    status: 'online',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderPage(devices: DeviceListItemDTO[]): Promise<unknown> {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
    },
  });
  queryClients.push(client);
  client.setQueryData(['devices'], devices);

  const ui: ReactElement = (
    <QueryClientProvider client={client}>
      <RegionalPreferencesProvider>
        <DevicesPage />
      </RegionalPreferencesProvider>
    </QueryClientProvider>
  );

  return renderWithProviders(ui, { router: { initialEntries: ['/'] } });
}

describe('settings DevicesPage', () => {
  it('marks a device the user switched off', async () => {
    await renderPage([
      device({ id: 1, name: 'Hall litterbox' }),
      device({ id: 2, name: 'Retired fountain', enabled: false }),
    ]);

    const labels = screen.getAllByText(DISABLED_LABEL);
    assert.equal(labels.length, 1);

    // The pill belongs to the disabled row, not merely to the page.
    const row = labels[0].closest('a');
    assert.ok(row);
    assert.match(row.textContent ?? '', /Retired fountain/);
  });

  it('marks a device whose provider account is switched off', async () => {
    await renderPage([
      device({ id: 1, name: 'Hall litterbox' }),
      device({ id: 2, name: 'Orphaned feeder', account_enabled: false }),
    ]);

    const labels = screen.getAllByText(ACCOUNT_DISABLED_LABEL);
    assert.equal(labels.length, 1);
    assert.match(labels[0].closest('a')?.textContent ?? '', /Orphaned feeder/);

    // The device's own switch is untouched, so the plain label would misdirect.
    assert.equal(screen.queryByText(DISABLED_LABEL), null);
  });

  it('leaves a fully enabled list unmarked', async () => {
    await renderPage([
      device({ id: 1, name: 'Hall litterbox' }),
      device({ id: 2, name: 'Kitchen feeder', type: 'feeder' }),
    ]);

    assert.equal(screen.queryByText(DISABLED_LABEL), null);
    assert.equal(screen.queryByText(ACCOUNT_DISABLED_LABEL), null);
  });
});
