import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { GetDeviceResponseDTO } from 'shared';

import DeviceAnnotationPage from '../DeviceAnnotationPage.tsx';
import RegionalPreferencesProvider from '@/contexts/RegionalPreferencesProvider';
import { renderWithProviders } from '@/test/render.tsx';

const DEVICE_ID = 1;

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
    id: DEVICE_ID,
    provider_account_id: 1,
    camera_link: null,
    provider: 'esphome',
    external_id: 'ext-1',
    name: 'Hall litterbox',
    type: 'litterbox',
    config: { visit_annotation_enabled: true },
    enabled: true,
    account_enabled: true,
    last_seen: null,
    status: 'online',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * Sibling routes stand in for the two places back can land, so the assertion is
 * where the click actually went rather than which props the header was handed.
 *
 * A data router because the workspace mounts `AnnotationTab`, whose unsaved
 * guard calls `useBlocker` — plain `MemoryRouter` cannot host one. A single
 * history entry leaves `location.key` at `default`, which is what sends
 * `useBackNavigation` to the canonical parent instead of popping: the deep-link
 * case this page has to get right.
 */
function renderAnnotationPage(seed: GetDeviceResponseDTO | null, path: string) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
    },
  });
  queryClients.push(client);
  if (seed) client.setQueryData(['device', DEVICE_ID], seed);

  const router = createMemoryRouter(
    [
      { path: '/devices/:id/annotate', element: <DeviceAnnotationPage /> },
      { path: '/devices/:id', element: <h2>device detail</h2> },
      { path: '/devices', element: <h2>devices roster</h2> },
    ],
    { initialEntries: [path] },
  );

  return renderWithProviders(
    <QueryClientProvider client={client}>
      <RegionalPreferencesProvider>
        <RouterProvider router={router} />
      </RegionalPreferencesProvider>
    </QueryClientProvider>,
  );
}

describe('DeviceAnnotationPage back navigation', () => {
  it('returns to the device being annotated, not the roster', async () => {
    await renderAnnotationPage(device(), `/devices/${DEVICE_ID}/annotate`);

    const [back] = screen.getAllByRole('button', { name: 'Hall litterbox' });
    assert.ok(back);

    await userEvent.click(back);

    assert.ok(screen.getByText('device detail'));
    assert.equal(screen.queryByText('devices roster'), null);
  });

  it('returns to the roster when the id in the URL is unreadable', async () => {
    await renderAnnotationPage(null, '/devices/not-a-number/annotate');

    const [back] = screen.getAllByRole('button', { name: 'Devices' });
    assert.ok(back);

    await userEvent.click(back);

    assert.ok(screen.getByText('devices roster'));
  });
});
