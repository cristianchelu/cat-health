import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { GetEventListItemDTO, GetFoodDTO } from 'shared';

import LogFoodSheet from '../LogFoodSheet.tsx';
import apiClient from '@/api/apiClient';
import RegionalPreferencesProvider from '@/contexts/RegionalPreferencesProvider';
import { renderWithProviders } from '@/test/render.tsx';

const queryClients: QueryClient[] = [];

let onPost: ((body: unknown) => void) | null = null;

/*
 * Nothing in this file may reach the network. Installed for the life of the
 * process rather than per test: logging invalidates four query keys, and a
 * refetch still in flight when a restore ran would open a real socket and
 * hold the process open long after the assertions finished.
 *
 * The stub answers by shape, so a query whose payload is an array gets one.
 */
apiClient.defaults.adapter = async (config) => {
  if (config.method?.toLowerCase() === 'post') {
    onPost?.(
      typeof config.data === 'string' ? JSON.parse(config.data) : config.data,
    );
  }
  const data = (config.url ?? '').includes('food-trends')
    ? []
    : { data: [], total: 0, limit: 30, offset: 0, hasMore: false };
  return { data, status: 200, statusText: 'OK', headers: {}, config };
};

afterEach(() => {
  cleanup();
  onPost = null;
  for (const client of queryClients.splice(0)) {
    client.clear();
  }
});

/** Resolves with the body of the next POST the sheet sends. */
function captureRequest() {
  return new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('no request was sent')),
      2000,
    );
    timer.unref?.();
    onPost = (body) => {
      clearTimeout(timer);
      resolve(body);
    };
  });
}

let nextId = 1;

/* Relative to the clock, not pinned to a date: "today" has to still be today
   whenever this runs. */
function todayAt(hour: number): string {
  const at = new Date();
  at.setHours(hour, 0, 0, 0);
  return at.toISOString();
}

function yesterdayAt(hour: number): string {
  const at = new Date();
  at.setDate(at.getDate() - 1);
  at.setHours(hour, 0, 0, 0);
  return at.toISOString();
}

function food(
  name: string,
  brand: string | null,
  foodType: GetFoodDTO['food_type'] = 'complete_wet',
  overrides: Partial<GetFoodDTO> = {},
): GetFoodDTO {
  return {
    id: nextId++,
    name,
    brand,
    food_type: foodType,
    barcode_ean13: null,
    moisture_percent: null,
    calories_per_100g: 90,
    nutrients: null,
    serving_size_g: 85,
    notes: null,
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

function intake(
  foodId: number,
  amount: number,
  timestamp: string,
): GetEventListItemDTO {
  return {
    id: nextId++,
    parent_event_id: null,
    note: null,
    note_updated_at: null,
    pet_id: 1,
    caused_by: 'pet',
    attributed_by: 'manual',
    device_id: null,
    timestamp,
    human_verified: true,
    data: { type: 'food_intake', food_type: 'wet', amount, food_id: foodId },
  };
}

/** Nine foods: past the flat-list threshold, so the ladder organizes them. */
function library() {
  return [
    food('Tuna in Gravy', 'Royal Canin'),
    food('Ageing 12+', 'Royal Canin'),
    food('Instinctive Jelly', 'Royal Canin'),
    food('Felix Salmon', 'Purina'),
    food('Gourmet Gold', 'Purina'),
    food('Sterilised 37', 'Royal Canin', 'complete_dry'),
    food('Orijen Cat', 'Orijen', 'complete_dry'),
    // One brand, one food: both browse levels are pointless here.
    food('Dreamies Chicken', 'Mars', 'treat'),
    food('Cosma Broth', 'Cosma', 'drink'),
  ];
}

interface RenderOptions {
  foods?: GetFoodDTO[];
  recents?: GetEventListItemDTO[];
  onClose?: () => void;
  scanSupported?: boolean;
}

async function renderSheet({
  foods = library(),
  recents = [],
  onClose = () => {},
  scanSupported = false,
}: RenderOptions = {}) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
      /* A settled mutation is garbage-collected five minutes later by
         default, and that timer keeps the test process alive long after the
         assertions are done. */
      mutations: { retry: false, gcTime: 0 },
    },
  });
  queryClients.push(client);
  client.setQueryData(['foods'], foods);
  client.setQueryData(['recentFoodIntakes', 1], {
    data: recents,
    total: recents.length,
    limit: 30,
    offset: 0,
    hasMore: false,
  });
  /* Seeded data is all these cases need, and a disabled query still serves
     its cache — so nothing refetches when logging invalidates these keys. */
  client.setQueryDefaults(['foodTrends'], { enabled: false });
  client.setQueryDefaults(['recentFoodIntakes'], { enabled: false });

  const view = await renderWithProviders(
    <QueryClientProvider client={client}>
      <RegionalPreferencesProvider>
        <LogFoodSheet
          isOpen
          onClose={onClose}
          petId={1}
          petName="Jazz"
          scanSupported={scanSupported}
          dateRange={{
            startDate: '2026-08-20',
            endDate: '2026-08-20',
            type: 'day',
          }}
        />
      </RegionalPreferencesProvider>
    </QueryClientProvider>,
    { router: { initialEntries: ['/'] } },
  );
  return { ...view, foods };
}

function rowNamed(pattern: RegExp) {
  return screen
    .getAllByRole('button')
    .find((button) => pattern.test(button.textContent ?? ''));
}

describe('LogFoodSheet ladder', () => {
  it('opens on Browse, with a row per type carrying its count', async () => {
    await renderSheet();

    assert.ok(screen.getByText('Browse'));
    assert.equal(screen.queryByText('Recent'), null);

    const wet = rowNamed(/Wet food/);
    assert.ok(wet);
    // 5 wet + 1 drink, which counts as wet.
    assert.match(wet.textContent ?? '', /6/);
    assert.match(rowNamed(/Dry food/)?.textContent ?? '', /2/);
  });

  it('walks type to brand to food, and back up the same way', async () => {
    await renderSheet();

    await userEvent.click(rowNamed(/Wet food/)!);
    assert.ok(rowNamed(/Royal Canin/));
    assert.ok(rowNamed(/Purina/));
    assert.match(screen.getByText(/Jazz ·/).textContent ?? '', /6 foods/);

    await userEvent.click(rowNamed(/Royal Canin/)!);
    assert.ok(rowNamed(/Tuna in Gravy/));
    assert.ok(rowNamed(/Ageing 12\+/));

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    assert.ok(rowNamed(/Purina/));

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    assert.ok(screen.getByText('Browse'));
  });

  it('skips the brand rung for a single-brand type, but never the food', async () => {
    await renderSheet();

    // Treats: one brand, so no brand rung — but the food is still shown and
    // still has to be chosen, which is also how you see it is not your tin.
    await userEvent.click(rowNamed(/Treats/)!);
    assert.equal(screen.queryByRole('slider'), null);
    const food = rowNamed(/Dreamies Chicken/);
    assert.ok(food);

    await userEvent.click(food);
    assert.ok(screen.getByRole('slider'));

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    assert.ok(rowNamed(/Dreamies Chicken/));
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    assert.ok(screen.getByText('Browse'));
  });

  it('closes when Back is pressed at the top of the ladder', async () => {
    let closed = 0;
    await renderSheet({ onClose: () => (closed += 1) });

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    assert.equal(closed, 1);
  });

  it('lists a small library flat, with type tags instead of groups', async () => {
    await renderSheet({
      foods: [
        food('Tuna in Gravy', 'Royal Canin'),
        food('Sterilised 37', 'Royal Canin', 'complete_dry'),
      ],
    });

    assert.equal(screen.queryByText('Browse'), null);
    assert.ok(rowNamed(/Tuna in Gravy/));
    assert.ok(rowNamed(/Sterilised 37/));

    await userEvent.click(rowNamed(/Tuna in Gravy/)!);
    assert.ok(screen.getByRole('slider'));
  });

  it('offers recently fed foods above Browse, at the amount last given', async () => {
    const foods = library();
    await renderSheet({
      foods,
      recents: [
        intake(foods[3].id, 40, todayAt(9)),
        intake(foods[0].id, 85, yesterdayAt(9)),
      ],
    });

    assert.ok(screen.getByText('Recent'));
    const recentRow = rowNamed(/Felix Salmon/);
    assert.ok(recentRow);
    assert.match(recentRow.textContent ?? '', /Today · 40 g/);

    await userEvent.click(recentRow);
    // Straight to the amount step, preloaded with what this cat actually ate.
    assert.equal(
      screen.getByRole('slider').getAttribute('aria-valuenow'),
      '40',
    );
  });

  it('falls back to the serving size for a food never logged before', async () => {
    await renderSheet();

    await userEvent.click(rowNamed(/Treats/)!);
    await userEvent.click(rowNamed(/Dreamies Chicken/)!);
    assert.equal(
      screen.getByRole('slider').getAttribute('aria-valuenow'),
      '85',
    );
  });

  it('logs the chosen food and amount, then gets out of the way', async () => {
    let closed = 0;
    const { foods } = await renderSheet({ onClose: () => (closed += 1) });
    const treat = foods.find((f) => f.food_type === 'treat')!;
    const posted = captureRequest();

    await userEvent.click(rowNamed(/Treats/)!);
    await userEvent.click(rowNamed(/Dreamies Chicken/)!);
    const slider = screen.getByRole('slider');
    slider.focus();
    await userEvent.keyboard('{ArrowLeft>5/}');

    const submit = rowNamed(/Log 80 g/);
    assert.ok(submit, 'the button says what it will log');

    await userEvent.click(submit);
    assert.deepEqual(await posted, {
      parent_event_id: null,
      pet_id: 1,
      device_id: null,
      human_verified: true,
      data: {
        type: 'food_intake',
        food_type: 'treat',
        amount: 80,
        food_id: treat.id,
      },
    });
    assert.equal(closed, 1);
  });

  it('offers the scan action only where the browser can scan', async () => {
    await renderSheet();
    assert.equal(
      screen.queryByRole('button', { name: 'Scan a barcode' }),
      null,
    );

    cleanup();
    await renderSheet({ scanSupported: true });
    assert.ok(screen.getByRole('button', { name: 'Scan a barcode' }));
  });

  it('keeps the scan action to the top of the ladder', async () => {
    await renderSheet({ scanSupported: true });

    // Once a type is chosen, scanning would answer a question already answered.
    await userEvent.click(rowNamed(/Wet food/)!);
    assert.equal(
      screen.queryByRole('button', { name: 'Scan a barcode' }),
      null,
    );
  });

  it('points at the food library when there is nothing to log', async () => {
    await renderSheet({ foods: [] });

    assert.ok(screen.getByRole('link', { name: 'Foods' }));
    assert.equal(screen.queryByText('Browse'), null);
  });
});
