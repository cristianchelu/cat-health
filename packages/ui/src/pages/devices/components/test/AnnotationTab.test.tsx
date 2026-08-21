import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import {
  createDefaultSettingsResponse,
  type GetEventListItemDTO,
  type GetPetResponseDTO,
} from 'shared';

import AnnotationTab from '../AnnotationTab.tsx';
import apiClient from '@/api/apiClient';
import RegionalPreferencesProvider from '@/contexts/RegionalPreferencesProvider';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { renderWithProviders } from '@/test/render.tsx';

/* The review queue: which visits are listed, how they are narrowed, and what
   the URL remembers about that. Phase 8 moves the rows onto `CardListItem`
   and the filters and pagination onto `Select` and `Button`; none of that may
   change what a reviewer can pick out of the list or link to. */

const queryClients: QueryClient[] = [];
const requests: { url?: string; params?: unknown }[] = [];

/* Installed for the life of the process — see LogFoodSheet's test for why a
   restore mid-run lets a late refetch escape to the network. */
apiClient.defaults.adapter = async (config) => {
  requests.push({ url: config.url, params: config.params });
  const url = config.url ?? '';
  /* Answered by route, not seeded: the tab refetches the page whenever the
     verified filter changes, and a seeded cache would not see that happen. */
  const data = url.includes('/pets')
    ? PETS
    : url.includes('/settings')
      ? createDefaultSettingsResponse()
      : url.endsWith('/media')
        ? []
        : pageFor(config.params as EventsParams);
  return { data, status: 200, statusText: 'OK', headers: {}, config };
};

afterEach(() => {
  cleanup();
  requests.length = 0;
  for (const client of queryClients.splice(0)) {
    client.clear();
  }
});

interface EventsParams {
  offset?: number;
  human_verified?: boolean;
}

const PETS: GetPetResponseDTO[] = [
  { id: 1, name: 'Luna', breed: 'Ragdoll', birth_date: null, is_away: false },
];

function visit(
  id: number,
  overrides: {
    verified?: boolean;
    eliminationType?: string;
    petId?: number | null;
    hour?: number;
  } = {},
): GetEventListItemDTO {
  const {
    verified = false,
    eliminationType = 'urination',
    petId = 1,
    hour = 9,
  } = overrides;
  return {
    id,
    parent_event_id: null,
    pet_id: petId,
    caused_by: petId == null ? 'unknown' : 'pet',
    attributed_by: petId == null ? null : 'weight',
    device_id: 7,
    timestamp: `2026-08-20T0${hour}:00:00.000Z`,
    data: {
      type: 'litterbox_use',
      elimination_type: eliminationType as 'urination',
      elimination_weight: 30,
      duration: 40,
    },
    human_verified: verified,
  };
}

const VERIFIED = visit(101, { verified: true, hour: 8 });
const UNVERIFIED = visit(102, { eliminationType: 'defecation', hour: 9 });
/* Something that is not a visit at all — the tab lists litterbox use only. */
const MAINTENANCE: GetEventListItemDTO = {
  id: 103,
  parent_event_id: null,
  pet_id: null,
  caused_by: 'human',
  attributed_by: 'manual',
  device_id: 7,
  timestamp: '2026-08-20T10:00:00.000Z',
  data: { type: 'litterbox_maintenance', maintenance_type: 'scoop' } as never,
  human_verified: true,
};

const ALL = [VERIFIED, UNVERIFIED, MAINTENANCE];

/** The server's answer, honouring the filter and offset the tab asked for. */
function pageFor(params: EventsParams = {}) {
  const filtered =
    params.human_verified === undefined
      ? ALL
      : ALL.filter((e) => e.human_verified === params.human_verified);
  const offset = params.offset ?? 0;
  return {
    data: offset > 0 ? [] : filtered,
    total: filtered.length,
    limit: 200,
    offset,
    hasMore: false,
  };
}

async function renderTab(initialEntry = '/devices/7?tab=annotation') {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  queryClients.push(client);
  client.setQueryData(['pets'], PETS);
  client.setQueryData(['settings'], createDefaultSettingsResponse());

  /* A data router, not `MemoryRouter`: the tab blocks navigation away from an
     unsaved visit, and `useBlocker` only exists on one. */
  const router = createMemoryRouter(
    [{ path: '/devices/:id', element: <AnnotationTab deviceId={7} /> }],
    { initialEntries: [initialEntry] },
  );

  const view = await renderWithProviders(
    <QueryClientProvider client={client}>
      <RegionalPreferencesProvider>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </RegionalPreferencesProvider>
    </QueryClientProvider>,
  );

  await waitFor(() => assert.ok(rows().length > 0));
  return view;
}

/* Scoped to the list: the two filter `<select>`s own options of their own. */
function rows() {
  const list = screen.queryByRole('listbox');
  return list ? within(list).queryAllByRole('option') : [];
}

/* Neither filter is named; each is identified by what it offers, which is what
   survives the move onto `Select`. */
function selectOffering(option: string): HTMLSelectElement {
  const found = screen
    .getAllByRole('combobox')
    .find((el) => within(el).queryByRole('option', { name: option })) as
    | HTMLSelectElement
    | undefined;
  assert.ok(found, `no select offers "${option}"`);
  return found;
}

describe('AnnotationTab', () => {
  it('lists litterbox visits only, newest state and all', async () => {
    await renderTab();

    /* The maintenance event came back on the same page and is not a visit. */
    assert.equal(rows().length, 2);
    /* The count above the list is the server's total for the page query, not
       the number of rows drawn — neither client-side filter feeds it. Recorded
       as it stands; Phase 8 is not the commit that changes it. */
    assert.ok(screen.getByText('3 events'));
  });

  it('says how each visit was left, and who it was attributed to', async () => {
    await renderTab();

    const reviewed = rows().find((r) =>
      within(r).queryByLabelText('Session annotated'),
    );
    assert.ok(reviewed, 'the verified visit is marked as reviewed');
    assert.match(reviewed.textContent ?? '', /Luna/);

    const untouched = rows().find((r) =>
      within(r).queryByLabelText('Not annotated'),
    );
    assert.ok(untouched, 'the unverified visit is marked as untouched');
    assert.match(untouched.textContent ?? '', /Defecation/);
  });

  it('narrows to what still needs a human, and asks the server for it', async () => {
    const user = userEvent.setup();
    await renderTab();

    await user.selectOptions(selectOffering('Unverified only'), 'unverified');

    await waitFor(() => assert.equal(rows().length, 1));
    assert.match(rows()[0].textContent ?? '', /Defecation/);
    /* The verified filter is a server query, not a client one — the page of
       200 would otherwise hide older unreviewed visits behind reviewed ones. */
    await waitFor(() =>
      assert.ok(
        requests.some(
          (r) =>
            (r.params as EventsParams | undefined)?.human_verified === false,
        ),
      ),
    );
  });

  it('narrows by elimination type without refetching', async () => {
    const user = userEvent.setup();
    await renderTab();
    const before = requests.length;

    await user.selectOptions(selectOffering('Urination'), 'urination');

    await waitFor(() => assert.equal(rows().length, 1));
    assert.equal(requests.length, before);
  });

  it('remembers the filters and the selection in the URL', async () => {
    /* The point of putting them there: a reviewer can link someone straight to
       the visit they are arguing about. */
    await renderTab('/devices/7?tab=annotation&elim=defecation');

    assert.equal(rows().length, 1);
    assert.match(rows()[0].textContent ?? '', /Defecation/);
  });

  it('drops a filter value it does not understand rather than showing nothing', async () => {
    await renderTab('/devices/7?tab=annotation&elim=sideways');

    assert.equal(rows().length, 2);
  });

  it('waits for a selection before it shows the workspace', async () => {
    await renderTab();

    assert.ok(
      screen.getByText('Select an event from the list to annotate it.'),
    );
  });

  it('offers stepping through the visits, but only from one', async () => {
    const user = userEvent.setup();
    await renderTab();

    /* Nothing is selected yet, so there is nowhere to step from. */
    assert.equal(
      screen.getByRole('button', { name: 'Prev' }).hasAttribute('disabled'),
      true,
    );
    assert.equal(
      screen.getByRole('button', { name: 'Next' }).hasAttribute('disabled'),
      true,
    );

    await user.click(rows()[0]);

    await waitFor(() =>
      assert.equal(rows()[0].getAttribute('aria-selected'), 'true'),
    );
    assert.equal(
      screen.getByRole('button', { name: 'Next' }).hasAttribute('disabled'),
      false,
    );
  });
});
