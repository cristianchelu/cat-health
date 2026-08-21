import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { GetDeviceResponseDTO, GetFoodDTO } from 'shared';

import FeederSettingsTab from '../FeederSettingsTab.tsx';
import apiClient from '@/api/apiClient';
import { renderWithProviders } from '@/test/render.tsx';

const queryClients: QueryClient[] = [];
const requests: { method?: string; body: unknown }[] = [];

/* Installed for the life of the process — see LogFoodSheet's test for why a
   restore mid-run lets a late refetch escape to the network. */
apiClient.defaults.adapter = async (config) => {
  requests.push({
    method: config.method,
    body:
      typeof config.data === 'string' ? JSON.parse(config.data) : config.data,
  });
  return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
};

afterEach(() => {
  cleanup();
  requests.length = 0;
  for (const client of queryClients.splice(0)) {
    client.clear();
  }
});

let nextId = 1;

function food(
  name: string,
  foodType: GetFoodDTO['food_type'],
  brand = 'Royal Canin',
): GetFoodDTO {
  return {
    id: nextId++,
    name,
    brand,
    food_type: foodType,
    barcode_ean13: null,
    moisture_percent: null,
    calories_per_100g: 380,
    nutrients: null,
    serving_size_g: null,
    notes: null,
    created_at: 0,
    updated_at: 0,
  };
}

const DRY = food('Sterilised 37', 'complete_dry');
/* Past the flat-list threshold, so the tab actually opens the ladder. */
const FOODS = [
  DRY,
  food('Fit 32', 'complete_dry'),
  food('Orijen Cat', 'complete_dry', 'Orijen'),
  food('Tuna in Gravy', 'complete_wet'),
  food('Ageing 12+', 'complete_wet'),
  food('Felix Salmon', 'complete_wet', 'Purina'),
  food('Gourmet Gold', 'complete_wet', 'Purina'),
  food('Sheba Poultry', 'complete_wet', 'Sheba'),
  food('Dreamies', 'treat', 'Mars'),
];

function feeder(): GetDeviceResponseDTO {
  return {
    id: 7,
    provider_account_id: 1,
    provider: 'surepet',
    external_id: 'feeder-7',
    name: 'Kitchen feeder',
    type: 'feeder',
    config: null,
    enabled: true,
    account_enabled: true,
    last_seen: '2026-08-20T10:00:00.000Z',
    status: 'online',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    state: {
      provider: 'surepet',
      bowl_status: [],
      bowl_type: 4,
      bowl_settings: [{ food_type: 2 }, { food_type: 1 }],
    } as unknown as GetDeviceResponseDTO['state'],
  };
}

async function renderTab() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  queryClients.push(client);
  client.setQueryData(['foods'], FOODS);

  return renderWithProviders(
    <QueryClientProvider client={client}>
      <FeederSettingsTab device={feeder()} />
    </QueryClientProvider>,
    { router: { initialEntries: ['/devices/7'] } },
  );
}

/* One row per bowl: what it holds, and the button that changes it. The rows
   are the assertion target — the button only ever says "Change". */
function bowls() {
  return [
    ...document.querySelectorAll<HTMLElement>(
      '.feeder-settings-compartments .list-item',
    ),
  ];
}

function openBowl(index: number) {
  return userEvent.click(within(bowls()[index]).getByRole('button'));
}

describe('FeederSettingsTab', () => {
  it('offers a field per bowl, unlinked until a food is chosen', async () => {
    await renderTab();

    const fields = bowls();
    assert.equal(fields.length, 2);
    for (const field of fields) {
      assert.match(field.textContent ?? '', /food_compartment_unlinked/);
    }
  });

  it('assigns into the draft, and only Save writes it', async () => {
    await renderTab();

    await openBowl(0);
    await userEvent.click(
      screen
        .getAllByRole('button')
        .find((b) => /Dry food/.test(b.textContent ?? ''))!,
    );
    await userEvent.click(
      screen
        .getAllByRole('button')
        .find((b) => /Royal Canin/.test(b.textContent ?? ''))!,
    );
    await userEvent.click(
      screen
        .getAllByRole('button')
        .find((b) => /Sterilised 37/.test(b.textContent ?? ''))!,
    );

    /* The row names the choice and what it is — brand, type, density —
       since that is what tells you the right bag went in the right bowl. */
    await waitFor(() =>
      assert.match(bowls()[0].textContent ?? '', /Sterilised 37/),
    );
    const linked = bowls()[0].textContent ?? '';
    assert.match(linked, /Royal Canin/);
    assert.match(linked, /dry/);
    assert.match(linked, /3800 kcal\/kg/);
    assert.equal(requests.length, 0);

    const save = screen.getByRole('button', { name: 'Save' });
    assert.equal(save.hasAttribute('disabled'), false);
    await userEvent.click(save);

    await waitFor(() => assert.equal(requests.length, 1));
    assert.equal(requests[0].method?.toLowerCase(), 'patch');
    assert.deepEqual((requests[0].body as { config: unknown }).config, {
      food_compartments: [
        { compartment: '0', food_id: DRY.id },
        { compartment: '1', food_id: null },
      ],
    });
  });

  it('keeps Save inert until something actually changed', async () => {
    await renderTab();

    assert.equal(
      screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled'),
      true,
    );
  });

  it('opens every bowl on the whole library, whatever it holds today', async () => {
    /* The left bowl reports dry, but a SureFeed bowl takes either — what the
       device is set to is its contents, not its capability. */
    await renderTab();

    await openBowl(0);
    await waitFor(() =>
      assert.ok(
        screen
          .getAllByRole('button')
          .some((b) => /Wet food/.test(b.textContent ?? '')),
      ),
    );
    assert.ok(
      screen
        .getAllByRole('button')
        .some((b) => /Dry food/.test(b.textContent ?? '')),
    );
  });
});
