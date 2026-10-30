import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { GetFoodDTO, PatchFoodRequestDTO } from 'shared';

import AddEditFoodPage from '../AddEditFoodPage.tsx';
import apiClient from '@/api/apiClient';
import RegionalPreferencesProvider from '@/contexts/RegionalPreferencesProvider';
import { renderWithProviders } from '@/test/render.tsx';

const POUCH: GetFoodDTO = {
  id: 7,
  name: 'Chicken Pouch',
  brand: null,
  food_type: 'complete_wet',
  barcode: null,
  moisture_percent: null,
  calories_per_100g: null,
  nutrients: null,
  serving_size_g: null,
  notes: null,
  created_at: 0,
  updated_at: 0,
};

const patches: PatchFoodRequestDTO[] = [];

/*
 * Installed for the life of the process so the refetch a save triggers can
 * never open a real socket. Every request answers with the pouch.
 */
apiClient.defaults.adapter = async (config) => {
  if (config.method?.toLowerCase() === 'patch') {
    patches.push(
      typeof config.data === 'string' ? JSON.parse(config.data) : config.data,
    );
  }
  return { data: POUCH, status: 200, statusText: 'OK', headers: {}, config };
};

const queryClients: QueryClient[] = [];

afterEach(() => {
  cleanup();
  patches.splice(0);
  for (const client of queryClients.splice(0)) client.clear();
});

async function renderFoodPage(food: GetFoodDTO = POUCH) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
      /* A settled mutation's default five-minute GC timer would hold the
         process open after the assertions finish. */
      mutations: { retry: false, gcTime: 0 },
    },
  });
  queryClients.push(client);
  client.setQueryData(['food', food.id], food);

  // `useUnsavedBlocker` needs a data router; a plain MemoryRouter will not do.
  const router = createMemoryRouter(
    [
      { path: '/settings/foods/:id', element: <AddEditFoodPage /> },
      { path: '/settings', element: <p>settings</p> },
    ],
    { initialEntries: [`/settings/foods/${food.id}`] },
  );

  await renderWithProviders(
    <QueryClientProvider client={client}>
      <RegionalPreferencesProvider>
        <RouterProvider router={router} />
      </RegionalPreferencesProvider>
    </QueryClientProvider>,
  );
}

const barcodeField = () => screen.getByLabelText('Barcode');
const saveButton = () => screen.getByRole('button', { name: 'Save Changes' });

describe('AddEditFoodPage barcode', () => {
  it('saves a barcode pasted with the spaces a pack prints', async () => {
    const user = userEvent.setup();
    await renderFoodPage();

    await user.click(barcodeField());
    await user.paste('5 901234 123457');
    await user.click(saveButton());

    await waitFor(() => assert.equal(patches.length, 1));
    assert.equal(patches[0].barcode, '5901234123457');
  });

  it('refuses to save a barcode of no GTIN length', async () => {
    const user = userEvent.setup();
    await renderFoodPage();

    await user.type(barcodeField(), '59012341234');
    await user.click(saveButton());

    assert.ok(
      await screen.findByText('Enter the digits printed under the barcode'),
    );
    assert.equal(patches.length, 0);
  });

  it('clears a stored barcode when the field is emptied', async () => {
    const user = userEvent.setup();
    await renderFoodPage({ ...POUCH, barcode: '036000291452' });

    await user.clear(barcodeField());
    await user.click(saveButton());

    await waitFor(() => assert.equal(patches.length, 1));
    assert.equal(patches[0].barcode, null);
  });
});
