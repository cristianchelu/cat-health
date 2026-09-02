import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { act, cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createDefaultSettingsResponse,
  type GetEventListItemDTO,
  type GetFoodDTO,
  type GetPetResponseDTO,
} from 'shared';

import EventEditForm from '../EventEditForm.tsx';
import { Dialog, DialogContent } from '@/components/ui/Dialog.tsx';
import RegionalPreferencesProvider from '@/contexts/RegionalPreferencesProvider';
import { MOBILE_QUERY } from '@/lib/breakpoints.ts';
import { resetMediaMatches, setMediaMatches } from '@/test/matchMedia.ts';
import { renderWithProviders } from '@/test/render.tsx';

/*
 * The phone half of the edit form: `AdaptiveSelect` only offers a page at phone
 * widths, so this ladder — form → picker level → back — is unreachable from
 * every other test in the suite, which all run the desktop branch.
 *
 * vaul is deliberately not in the picture: the drawer is a `Sheet` concern,
 * and what is under test is the page swap inside whatever hosts it.
 */

const queryClients: QueryClient[] = [];

afterEach(() => {
  cleanup();
  resetMediaMatches();
  for (const client of queryClients.splice(0)) client.clear();
});

const PETS: GetPetResponseDTO[] = [
  { id: 1, name: 'Luna', breed: 'Ragdoll', birth_date: null, is_away: false },
  { id: 2, name: 'Jazz', breed: 'Bengal', birth_date: null, is_away: false },
];

const GUESSED_VISIT: GetEventListItemDTO = {
  parent_event_id: null,
  note: null,
  note_updated_at: null,
  id: 21,
  pet_id: 1,
  caused_by: 'pet',
  attributed_by: 'weight',
  device_id: 3,
  timestamp: '2026-08-20T10:30:00.000Z',
  data: {
    type: 'litterbox_use',
    duration: 45,
    elimination_weight: 30,
    elimination_type: 'urination',
    straining: false,
  },
  human_verified: false,
};

const MICROCHIP_MEAL: GetEventListItemDTO = {
  parent_event_id: null,
  note: null,
  note_updated_at: null,
  id: 22,
  pet_id: 2,
  caused_by: 'pet',
  attributed_by: 'microchip',
  device_id: 5,
  timestamp: '2026-08-20T05:12:00.000Z',
  data: { type: 'food_intake', food_type: 'dry', amount: 42 },
  human_verified: false,
};

const FOODS: GetFoodDTO[] = [
  {
    id: 7,
    name: 'Salmon pouch',
    brand: 'Felix',
    food_type: 'complete_wet',
    barcode_ean13: null,
    moisture_percent: 80,
    calories_per_100g: 90,
    nutrients: null,
    serving_size_g: 85,
    notes: null,
    created_at: 0,
    updated_at: 0,
  },
];

async function renderPhoneEditForm(event: GetEventListItemDTO = GUESSED_VISIT) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  queryClients.push(client);
  client.setQueryData(['pets'], PETS);
  client.setQueryData(['foods'], FOODS);
  client.setQueryData(['settings'], createDefaultSettingsResponse());

  return renderWithProviders(
    <QueryClientProvider client={client}>
      <RegionalPreferencesProvider>
        <Dialog open>
          <DialogContent showCloseButton={false}>
            <EventEditForm
              event={event}
              eventChildren={[]}
              onClose={() => {}}
            />
          </DialogContent>
        </Dialog>
      </RegionalPreferencesProvider>
    </QueryClientProvider>,
  );
}

describe('EventEditForm on a phone', () => {
  it('takes the whole surface for a picker level, and comes back with the answer', async () => {
    act(() => {
      setMediaMatches(MOBILE_QUERY, true);
    });
    const user = userEvent.setup();
    await renderPhoneEditForm();

    /* The phone anchor: a button that opens a page, not a listbox. */
    const trigger = screen.getByRole('button', { name: /Cat/ });
    assert.equal(trigger.getAttribute('aria-haspopup'), 'dialog');
    assert.match(trigger.textContent ?? '', /Luna/);

    await user.click(trigger);

    /* The level replaced the form rather than opening a second sheet over
       it — under reduced motion (the test default) that swap is synchronous,
       exactly as the plain conditional it replaced was. */
    const level = screen.getByRole('radiogroup', { name: /Cat/ });
    assert.equal(screen.queryByRole('button', { name: /^Save/ }), null);

    await user.click(within(level).getByRole('radio', { name: /Jazz/ }));

    assert.equal(screen.queryByRole('radiogroup'), null);
    assert.match(
      screen.getByRole('button', { name: /Cat/ }).textContent ?? '',
      /Jazz/,
    );
  });

  it('walks the food library as a level too, on the same rung', async () => {
    act(() => {
      setMediaMatches(MOBILE_QUERY, true);
    });
    const user = userEvent.setup();
    await renderPhoneEditForm(MICROCHIP_MEAL);

    /* A meal with no food row says so rather than showing a blank. */
    const trigger = screen.getByRole('button', { name: 'Food' });
    assert.match(trigger.textContent ?? '', /Not linked/);

    await user.click(trigger);

    const level = screen.getByRole('radiogroup', { name: 'Food' });
    /* Brand is the grouping, not part of each row's name. */
    assert.match(level.textContent ?? '', /Felix/);
    await user.click(
      within(level).getByRole('radio', { name: /Salmon pouch/ }),
    );

    assert.equal(screen.queryByRole('radiogroup'), null);
    assert.match(
      screen.getByRole('button', { name: 'Food' }).textContent ?? '',
      /Salmon pouch/,
    );
  });
});
