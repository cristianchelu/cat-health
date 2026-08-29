import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createDefaultSettingsResponse,
  encodeLitterboxRawData,
  LITTERBOX_RAW_DATA_VERSION_2,
  type GetEventListItemDTO,
  type GetEventMediaResponseDTO,
  type GetPetResponseDTO,
} from 'shared';

import EventDetailsModal from '../EventDetailsModal.tsx';
import apiClient from '@/api/apiClient';
import RegionalPreferencesProvider from '@/contexts/RegionalPreferencesProvider';
import { renderWithProviders } from '@/test/render.tsx';

/* What the modal is for: saying who an event belongs to and what it was, then
   saving that. These tests hold the surface — the roles, the names, the
   payloads — while Phase 7 replaces the tab bar, the buttons and the selects
   underneath it. No class names: that is the whole point of writing them
   before the migration. */

const queryClients: QueryClient[] = [];
const requests: { method?: string; url?: string; body: unknown }[] = [];

/* Installed for the life of the process — see LogFoodSheet's test for why a
   restore mid-run lets a late refetch escape to the network. */
apiClient.defaults.adapter = async (config) => {
  requests.push({
    method: config.method,
    url: config.url,
    body:
      typeof config.data === 'string' ? JSON.parse(config.data) : config.data,
  });
  const id = Number(/\/events\/(\d+)/.exec(config.url ?? '')?.[1]);
  return {
    data:
      config.method === 'delete'
        ? { success: true }
        : detailOf(eventById(id), true),
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  };
};

/** Everything the modal did that was not just reading. */
function writes() {
  return requests.filter((r) => r.method?.toLowerCase() !== 'get');
}

afterEach(() => {
  cleanup();
  requests.length = 0;
  for (const client of queryClients.splice(0)) {
    client.clear();
  }
});

const PETS: GetPetResponseDTO[] = [
  { id: 1, name: 'Luna', breed: 'Ragdoll', birth_date: null, is_away: false },
  { id: 2, name: 'Jazz', breed: 'Bengal', birth_date: null, is_away: false },
];

const WATER_EVENT: GetEventListItemDTO = {
  id: 11,
  parent_event_id: null,
  pet_id: null,
  caused_by: 'unknown',
  attributed_by: null,
  device_id: 3,
  timestamp: '2026-08-20T09:15:00.000Z',
  data: {
    type: 'water_intake',
    amount: 42,
    duration: 18,
    excluded_amount: 5,
  },
  human_verified: false,
  note: null,
  note_updated_at: null,
};

const LITTERBOX_EVENT: GetEventListItemDTO = {
  id: 12,
  parent_event_id: null,
  pet_id: 1,
  caused_by: 'pet',
  attributed_by: 'weight',
  device_id: 4,
  timestamp: '2026-08-20T10:30:00.000Z',
  data: {
    type: 'litterbox_use',
    elimination_type: 'urination',
    elimination_weight: 30,
    duration: 45,
    straining: false,
    segments: [{ state: 'occupied', start: 0, end: 3 }],
  },
  human_verified: false,
  note: null,
  note_updated_at: null,
};

function eventById(id: number): GetEventListItemDTO {
  return id === WATER_EVENT.id ? WATER_EVENT : LITTERBOX_EVENT;
}

/**
 * What `GET /events/:id` answers. The list row the modal is handed has no
 * `raw_data`; the signal only ever arrives through here, which is why the
 * analysis tab is a property of the detail fetch and not of the row.
 */
function detailOf(event: GetEventListItemDTO, withSignal: boolean) {
  return {
    ...event,
    raw_data:
      withSignal && event.data.type === 'litterbox_use'
        ? Array.from(
            encodeLitterboxRawData({
              version: LITTERBOX_RAW_DATA_VERSION_2,
              startTimeMs: Date.UTC(2026, 7, 20, 10, 30, 0),
              weights: [4100, 4400, 4420, 4380, 4120],
              sampleOffsetsMs: [0, 137, 274, 411, 548],
            }),
          )
        : null,
    children: [],
  };
}

const IMAGE_MEDIA: GetEventMediaResponseDTO = [
  {
    id: 91,
    created_at: 0,
    file_path: 'events/11/frame.jpg',
    mime_type: 'image/jpeg',
    file_size: 1024,
    description: null,
    metadata: null,
    relation: 'snapshot',
  },
];

interface RenderOptions {
  media?: GetEventMediaResponseDTO;
  /** Seed the detail fetch, so the analysis tab has a signal to draw. */
  withSignal?: boolean;
  onClose?: () => void;
}

async function renderModal(
  event: GetEventListItemDTO,
  { media = [], withSignal = false, onClose = () => {} }: RenderOptions = {},
) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  queryClients.push(client);
  client.setQueryData(['pets'], PETS);
  client.setQueryData(['settings'], createDefaultSettingsResponse());
  client.setQueryData(['events', event.id, 'media'], media);
  /* Seeded rather than fetched: the detail query is enabled the moment the
     modal opens, and an unseeded one would race every assertion below. */
  client.setQueryData(['event', event.id], detailOf(event, withSignal));

  return renderWithProviders(
    <QueryClientProvider client={client}>
      <RegionalPreferencesProvider>
        <EventDetailsModal event={event} isOpen onClose={onClose} />
      </RegionalPreferencesProvider>
    </QueryClientProvider>,
  );
}

/* Neither select is named — they are identified by what they offer, which is
   also what survives the move onto the kit. */
function selectOffering(option: string): HTMLSelectElement {
  const found = screen
    .getAllByRole('combobox')
    .find((el) => within(el).queryByRole('option', { name: option })) as
    | HTMLSelectElement
    | undefined;
  assert.ok(found, `no select offers "${option}"`);
  return found;
}

describe('EventDetailsModal', () => {
  it('names the event, when it happened, and what the sensor measured', async () => {
    await renderModal(WATER_EVENT);

    assert.ok(screen.getByRole('heading', { name: 'Water Intake' }));

    const dialog = screen.getByRole('dialog');
    assert.match(dialog.textContent ?? '', /Duration:\s*18s/);
    assert.match(dialog.textContent ?? '', /Amount:\s*42ml/);
    /* The spill line only appears when some of the draw was excluded. */
    assert.match(dialog.textContent ?? '', /Spilled:\s*5ml/);
  });

  it('says so when the event has no media', async () => {
    await renderModal(WATER_EVENT);

    assert.ok(screen.getByText('No media available'));
  });

  it('shows the captured frame, and offers it for download', async () => {
    await renderModal(WATER_EVENT, { media: IMAGE_MEDIA });

    assert.ok(screen.getByRole('img', { name: 'Event media' }));
    assert.ok(screen.getByRole('button', { name: 'Download Media' }));
  });

  it('offers no analysis tab until there is a signal to draw', async () => {
    await renderModal(WATER_EVENT);

    assert.equal(screen.queryByRole('button', { name: /Analysis/ }), null);
    assert.equal(screen.queryByRole('button', { name: /^Media$/ }), null);
  });

  it('opens on media, and swaps in the chart when analysis is chosen', async () => {
    const user = userEvent.setup();
    await renderModal(LITTERBOX_EVENT, { withSignal: true });

    /* Media is the landing tab even for an event whose point is the signal. */
    assert.ok(screen.getByText('No media available'));

    await user.click(screen.getByRole('button', { name: /Analysis/ }));

    await waitFor(() =>
      assert.equal(screen.queryByText('No media available'), null),
    );
    /* The chart names the states it shades, which is the only thing about it
       that is legible to a test. */
    assert.ok(screen.getByText('Eliminating'));
  });

  it('keeps Save inert until something actually changed', async () => {
    await renderModal(WATER_EVENT);

    assert.equal(
      screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled'),
      true,
    );
  });

  it('re-attributes the event to a pet, and marks it verified', async () => {
    const user = userEvent.setup();
    await renderModal(WATER_EVENT);

    await user.selectOptions(selectOffering('Luna'), 'pet:1');

    const save = screen.getByRole('button', { name: 'Save' });
    assert.equal(save.hasAttribute('disabled'), false);
    await user.click(save);

    await waitFor(() => assert.equal(writes().length, 1));
    assert.equal(writes()[0].method?.toLowerCase(), 'patch');
    assert.equal(writes()[0].url, '/events/11');
    assert.deepEqual(writes()[0].body, {
      pet_id: 1,
      caused_by: 'pet',
      human_verified: true,
    });
  });

  it('drops the stale segments when the elimination type is corrected', async () => {
    const user = userEvent.setup();
    await renderModal(LITTERBOX_EVENT);

    await user.selectOptions(selectOffering('Defecation'), 'defecation');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => assert.equal(writes().length, 1));
    const body = writes()[0].body as {
      data: { elimination_type: string; segments: unknown };
    };
    assert.equal(body.data.elimination_type, 'defecation');
    /* The old segments describe a different event; the server re-runs them. */
    assert.equal(body.data.segments, null);
  });

  it('records straining without touching the segments', async () => {
    const user = userEvent.setup();
    await renderModal(LITTERBOX_EVENT);

    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => assert.equal(writes().length, 1));
    const body = writes()[0].body as {
      data: { straining: boolean; segments?: unknown };
    };
    assert.equal(body.data.straining, true);
    assert.notEqual(body.data.segments, null);
  });

  it('asks before dropping unsaved edits, and closes only once told to', async () => {
    const user = userEvent.setup();
    let closed = 0;
    await renderModal(WATER_EVENT, { onClose: () => (closed += 1) });

    await user.selectOptions(selectOffering('Luna'), 'pet:1');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    assert.equal(closed, 0);
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    assert.equal(closed, 1);
  });

  it('confirms a delete, and offers to re-identify what came after it', async () => {
    const user = userEvent.setup();
    await renderModal(LITTERBOX_EVENT);

    await user.click(screen.getByRole('button', { name: 'Delete Event' }));

    const confirm = screen.getByRole('dialog', { name: 'Delete visit' });
    assert.ok(
      within(confirm).getByRole('checkbox', {
        name: 'Re-identify later visits on this device',
      }),
    );

    await user.click(
      within(confirm).getByRole('button', { name: 'Delete visit' }),
    );

    await waitFor(() => assert.equal(writes().length, 1));
    assert.equal(writes()[0].method?.toLowerCase(), 'delete');
    assert.equal(writes()[0].url, '/events/12');
  });

  it('re-runs the analyzer on demand for a litterbox visit', async () => {
    const user = userEvent.setup();
    await renderModal(LITTERBOX_EVENT, { withSignal: true });

    await user.click(screen.getByRole('button', { name: 'Analyze' }));

    await waitFor(() => assert.equal(writes().length, 1));
    assert.equal(writes()[0].method?.toLowerCase(), 'post');
    assert.equal(writes()[0].url, '/events/12/analyze');
  });
});
