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
  type GetFoodDTO,
  type GetPetResponseDTO,
} from 'shared';

import EventDetailsModal from '../EventDetailsModal.tsx';
import apiClient from '@/api/apiClient';
import RegionalPreferencesProvider from '@/contexts/RegionalPreferencesProvider';
import { renderWithProviders } from '@/test/render.tsx';

/* What the modal is for: reading one event, and — only where the machine
   guessed — settling that guess. These tests hold the surface by its roles,
   its names and its payloads. No class names, and nothing about the shape of
   the band beyond the question it asks. */

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

const BASE = {
  parent_event_id: null,
  note: null,
  note_updated_at: null,
} as const;

/** The matcher gave up: a device event with nothing decided. */
const UNASSIGNED_WATER: GetEventListItemDTO = {
  ...BASE,
  id: 11,
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
};

/** The scale guessed a cat: the one shape that gets the band. */
const GUESSED_VISIT: GetEventListItemDTO = {
  ...BASE,
  id: 12,
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
};

/** The hardware knew. Certainty has no question to ask. */
const MICROCHIP_MEAL: GetEventListItemDTO = {
  ...BASE,
  id: 13,
  pet_id: 2,
  caused_by: 'pet',
  attributed_by: 'microchip',
  device_id: 5,
  timestamp: '2026-08-20T05:12:00.000Z',
  data: { type: 'food_intake', food_type: 'dry', amount: 42 },
  human_verified: false,
};

/** You logged it, so nothing was guessed. */
const MANUAL_MEAL: GetEventListItemDTO = {
  ...BASE,
  id: 14,
  pet_id: 2,
  caused_by: 'pet',
  attributed_by: 'manual',
  device_id: null,
  timestamp: '2026-08-19T19:30:00.000Z',
  data: { type: 'food_intake', food_type: 'wet', amount: 85 },
  human_verified: true,
};

/** Already answered: the band is gone, a pill says so. */
const VERIFIED_VISIT: GetEventListItemDTO = {
  ...GUESSED_VISIT,
  id: 15,
  human_verified: true,
};

/** The analyzer split the draw: some counted, the rest was spill. */
const FILTERED_WATER: GetEventListItemDTO = {
  ...BASE,
  id: 17,
  pet_id: 1,
  caused_by: 'pet',
  attributed_by: 'weight',
  device_id: 3,
  timestamp: '2026-08-20T11:45:00.000Z',
  data: {
    type: 'water_intake',
    amount: 30,
    duration: 40,
    source: 'drinking',
    raw_amount: 45,
    excluded_amount: 15,
    filtered: true,
  },
  human_verified: false,
};

/** Not about a cat at all: nothing to correct, so the menu is Delete alone. */
const SCOOP: GetEventListItemDTO = {
  ...BASE,
  id: 18,
  pet_id: null,
  caused_by: 'human',
  attributed_by: null,
  device_id: 4,
  timestamp: '2026-08-20T08:00:00.000Z',
  data: { type: 'litterbox_maintenance', maintenance_type: 'scoop' },
  human_verified: false,
};

const ALL_EVENTS = [
  UNASSIGNED_WATER,
  GUESSED_VISIT,
  MICROCHIP_MEAL,
  MANUAL_MEAL,
  VERIFIED_VISIT,
  FILTERED_WATER,
  SCOOP,
];

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

function eventById(id: number): GetEventListItemDTO {
  return ALL_EVENTS.find((e) => e.id === id) ?? GUESSED_VISIT;
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
  detail?: Record<string, unknown>;
  /** Seeds the device roster, which is where the camera link lives. */
  devices?: unknown[];
}

async function renderModal(
  event: GetEventListItemDTO,
  {
    media = [],
    withSignal = false,
    onClose = () => {},
    detail,
    devices = [],
  }: RenderOptions = {},
) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  queryClients.push(client);
  client.setQueryData(['pets'], PETS);
  client.setQueryData(['devices'], devices);
  client.setQueryData(['settings'], createDefaultSettingsResponse());
  /* Always seeded: the edit form's food query is live on food events, and an
     unseeded fetch would take whatever the event adapter answers. */
  client.setQueryData(['foods'], FOODS);
  client.setQueryData(['events', event.id, 'media'], media);
  /* Seeded rather than fetched: the detail query is enabled the moment the
     modal opens, and an unseeded one would race every assertion below. */
  client.setQueryData(['event', event.id], {
    ...detailOf(event, withSignal),
    ...detail,
  });

  return renderWithProviders(
    <QueryClientProvider client={client}>
      <RegionalPreferencesProvider>
        <EventDetailsModal event={event} isOpen onClose={onClose} />
      </RegionalPreferencesProvider>
    </QueryClientProvider>,
  );
}

/** Open the one correction form, from wherever this event offers it. */
async function openEditForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Edit' }));
  return screen.getByRole('dialog', { name: /Edit this event/ });
}

describe('EventDetailsModal', () => {
  it('names the kind of event, and shows the cat as a reading of it', async () => {
    await renderModal(GUESSED_VISIT);

    /* The title names the kind and nothing else: a sentence naming the cat
       overflows on a long name and asks every translation to carry English
       subject-verb grammar. */
    assert.ok(screen.getByRole('heading', { name: /Litterbox visit/ }));

    const dialog = screen.getByRole('dialog');
    assert.match(dialog.textContent ?? '', /Luna\s*Cat/);
    assert.match(dialog.textContent ?? '', /30\s*g\s*Deposit/);
    assert.match(dialog.textContent ?? '', /45\s*s\s*In the box/);
    /* What the visit was is a reading in its own right, not a clause trailing
       the time and place. */
    assert.match(dialog.textContent ?? '', /Urination\s*Type/);
  });

  it('keeps quiet about straining until there is some', async () => {
    await renderModal(GUESSED_VISIT);
    assert.equal(screen.queryByText('Straining'), null);

    cleanup();
    await renderModal({
      ...GUESSED_VISIT,
      id: 16,
      data: { ...GUESSED_VISIT.data, type: 'litterbox_use', straining: true },
    } as GetEventListItemDTO);

    /* A slot that mostly says nothing-is-wrong trains you to skip the one
       time it does not. */
    assert.ok(screen.getByText('Straining'));
  });

  it('says so in the cat slot when the matcher could not name one', async () => {
    await renderModal(UNASSIGNED_WATER);

    assert.ok(screen.getByRole('heading', { name: /Water intake/ }));
    assert.match(
      screen.getByRole('dialog').textContent ?? '',
      /Not identified\s*Cat/,
    );
    /* The spill line only appears when some of the draw was excluded. */
    assert.match(
      screen.getByRole('dialog').textContent ?? '',
      /5\s*ml\s*Spilled/,
    );
  });

  it('opens on its own title when there is no clip', async () => {
    await renderModal(MICROCHIP_MEAL);

    /* No stage at all, rather than a black box saying it is empty. */
    assert.equal(screen.queryByRole('img', { name: 'Event media' }), null);
    assert.ok(screen.getByRole('heading', { name: /Food intake/ }));
  });

  it('shows the captured frame, and offers it for download', async () => {
    const user = userEvent.setup();
    await renderModal(UNASSIGNED_WATER, { media: IMAGE_MEDIA });

    assert.ok(screen.getByRole('img', { name: 'Event media' }));

    await user.click(screen.getByRole('button', { name: 'More actions' }));
    assert.ok(screen.getByRole('menuitem', { name: 'Download Media' }));
  });

  it('shows an empty stage only where a camera should have recorded', async () => {
    /* Enough of a device for the modal: it reads the name and the camera
       link, and nothing else. */
    const withCamera = [
      { id: 4, name: 'Main Litterbox', camera_link: { camera_id: 9 } },
    ];

    await renderModal(GUESSED_VISIT, { devices: withCamera });
    /* A camera that produced no clip is a failure worth showing. */
    assert.ok(screen.getByLabelText('No recording'));

    cleanup();
    await renderModal(GUESSED_VISIT, {
      devices: [{ id: 4, name: 'Main Litterbox' }],
    });
    /* No camera, no clip to miss — the surface starts at its title. */
    assert.equal(screen.queryByLabelText('No recording'), null);
  });

  it('shows no tab strip over the media, on any event', async () => {
    /* The signal chart shared this space behind a Media|Analysis strip that
       read as chrome bolted to the top of the sheet. It is homeless until it
       gets a surface of its own; the strip is not coming back to host it. */
    await renderModal(GUESSED_VISIT, {
      media: IMAGE_MEDIA,
      withSignal: true,
    });

    assert.equal(screen.queryByRole('button', { name: /Analysis/ }), null);
    assert.equal(screen.queryByRole('button', { name: /^Media$/ }), null);
    assert.ok(screen.getByRole('img', { name: 'Event media' }));
  });

  it('asks once where the machine guessed, and verifying is a single write', async () => {
    const user = userEvent.setup();
    await renderModal(GUESSED_VISIT);

    const dialog = screen.getByRole('dialog');
    assert.match(dialog.textContent ?? '', /Matched to\s*Luna\s*by weight/);

    await user.click(screen.getByRole('button', { name: 'Looks right' }));

    await waitFor(() => assert.equal(writes().length, 1));
    assert.equal(writes()[0].method?.toLowerCase(), 'patch');
    assert.equal(writes()[0].url, '/events/12');
    assert.deepEqual(writes()[0].body, { human_verified: true });
  });

  it('asks nothing where the hardware knew', async () => {
    await renderModal(MICROCHIP_MEAL);

    assert.equal(screen.queryByRole('button', { name: 'Looks right' }), null);
    assert.equal(screen.queryByRole('button', { name: 'Edit' }), null);
  });

  it('still offers Edit for a microchip meal, as a late second thought', async () => {
    /* The chip named the animal, not the amount: the reading can be wrong on
       exactly the device whose attribution cannot be. No band, no header
       button — the way in is the kebab, like any settled event. */
    const user = userEvent.setup();
    await renderModal(MICROCHIP_MEAL);

    await user.click(screen.getByRole('button', { name: 'More actions' }));
    assert.ok(screen.getByRole('menuitem', { name: 'Edit' }));
  });

  it('corrects the grams without relabelling who ate them', async () => {
    const user = userEvent.setup();
    await renderModal(MICROCHIP_MEAL);

    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));
    const form = screen.getByRole('dialog', { name: /Edit this event/ });

    const amount = within(form).getByRole('spinbutton', {
      name: 'Amount eaten',
    });
    await user.clear(amount);
    /* Zero is the answer for a refill misread as a meal. */
    await user.type(amount, '0');
    await user.click(within(form).getByRole('button', { name: 'Save' }));

    await waitFor(() => assert.equal(writes().length, 1));
    assert.equal(writes()[0].url, '/events/13');
    const body = writes()[0].body as Record<string, unknown>;
    assert.equal((body.data as { amount: number }).amount, 0);
    assert.equal(body.human_verified, true);
    /* An untouched attribution is not a decision: restating it would stamp
       `attributed_by: 'manual'` over what the chip actually read. */
    assert.equal('pet_id' in body, false);
    assert.equal('caused_by' in body, false);
  });

  it('links a food to a meal, and stamps its coarse type', async () => {
    const user = userEvent.setup();
    await renderModal(MICROCHIP_MEAL);

    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));
    const form = screen.getByRole('dialog', { name: /Edit this event/ });

    /* Not a dropdown: the trigger walks the same browse ladder every other
       food field walks, as levels of this same drawer — no second sheet
       opens over it. One food in the library, so the ladder goes out flat
       and the row is one tap away. */
    await user.click(within(form).getByRole('button', { name: 'Food' }));
    assert.equal(screen.getAllByRole('dialog').length, 1);
    const foodRow = within(form)
      .getAllByRole('button')
      .find((row) => /Salmon pouch/.test(row.textContent ?? ''));
    assert.ok(foodRow);
    await user.click(foodRow);
    await user.click(within(form).getByRole('button', { name: 'Save' }));

    await waitFor(() => assert.equal(writes().length, 1));
    const body = writes()[0].body as {
      data: { food_id: number; food_type: string; amount: number };
    };
    assert.equal(body.data.food_id, 7);
    /* The same wet/dry/treat bucket the log ladder would stamp; the server
       recomputes the nutrients from the row. */
    assert.equal(body.data.food_type, 'wet');
    assert.equal(body.data.amount, 42);
  });

  it('never claims "Not linked" for a linked meal whose row is missing', async () => {
    const user = userEvent.setup();
    await renderModal(MICROCHIP_MEAL, {
      detail: { data: { ...MICROCHIP_MEAL.data, food_id: 999 } },
    });

    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));
    const form = screen.getByRole('dialog', { name: /Edit this event/ });

    /* The library has no row 999 — deleted, say. Blank is the honest face:
       the meal is still linked, and "Not linked" would be a false claim. */
    const trigger = within(form).getByRole('button', { name: 'Food' });
    assert.doesNotMatch(trigger.textContent ?? '', /Not linked/);
  });

  it('corrects the drank amount, and the spill follows the invariant', async () => {
    const user = userEvent.setup();
    await renderModal(FILTERED_WATER);

    const form = await openEditForm(user);
    const amount = within(form).getByRole('spinbutton', {
      name: 'Amount drunk',
    });
    await user.clear(amount);
    await user.type(amount, '20');

    /* The consequence is named before Save, in the field's own hint slot. */
    assert.match(
      form.textContent ?? '',
      /other 25 ml the sensor saw will count as spilled/,
    );

    await user.click(within(form).getByRole('button', { name: 'Save' }));

    await waitFor(() => assert.equal(writes().length, 1));
    const body = writes()[0].body as {
      data: {
        amount: number;
        raw_amount: number;
        excluded_amount: number;
        filtered: boolean;
      };
    };
    assert.equal(body.data.amount, 20);
    assert.equal(body.data.raw_amount, 45);
    assert.equal(body.data.excluded_amount, 25);
    assert.equal(body.data.filtered, true);
  });

  it('promises the exact split the save will write, fractions included', async () => {
    const user = userEvent.setup();
    await renderModal(FILTERED_WATER);

    const form = await openEditForm(user);
    const amount = within(form).getByRole('spinbutton', {
      name: 'Amount drunk',
    });
    await user.clear(amount);
    /* A sub-millilitre remainder: rounding would hide the hint entirely
       while the save still flips the event to filtered. */
    await user.type(amount, '44.6');

    assert.match(
      form.textContent ?? '',
      /other 0\.4 ml the sensor saw will count as spilled/,
    );

    await user.click(within(form).getByRole('button', { name: 'Save' }));

    await waitFor(() => assert.equal(writes().length, 1));
    const body = writes()[0].body as {
      data: { amount: number; excluded_amount: number; filtered: boolean };
    };
    assert.equal(body.data.amount, 44.6);
    /* The hint and the stored value came from the same arithmetic. */
    assert.ok(Math.abs(body.data.excluded_amount - 0.4) < 1e-9);
    assert.equal(body.data.filtered, true);
  });

  it('rejects an amount outside its window before anything is written', async () => {
    const user = userEvent.setup();
    await renderModal(FILTERED_WATER);

    const form = await openEditForm(user);
    const amount = within(form).getByRole('spinbutton', {
      name: 'Amount drunk',
    });
    await user.clear(amount);
    await user.type(amount, '5000');
    await user.click(within(form).getByRole('button', { name: 'Save' }));

    assert.ok(within(form).getByText('Amount must be between 0 and 2000 ml.'));
    assert.equal(writes().length, 0);
  });

  it('hands back the device reading after an amount edit', async () => {
    const user = userEvent.setup();
    await renderModal(MICROCHIP_MEAL);

    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));
    const form = screen.getByRole('dialog', { name: /Edit this event/ });

    const amount = within(form).getByRole('spinbutton', {
      name: 'Amount eaten',
    });
    await user.clear(amount);
    await user.type(amount, '15');

    await user.click(
      within(form).getByRole('button', { name: 'Restore 42 g' }),
    );
    assert.equal((amount as HTMLInputElement).value, '42');
    assert.equal(writes().length, 0);
  });

  it('offers Edit in the menu, not a band, on an event you logged yourself', async () => {
    const user = userEvent.setup();
    await renderModal(MANUAL_MEAL);

    assert.equal(screen.queryByRole('button', { name: 'Looks right' }), null);
    /* Nothing was guessed, so nothing asks from the surface: the one home
       Edit has is the kebab, here like everywhere else. */
    assert.equal(screen.queryByRole('button', { name: 'Edit' }), null);
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    assert.ok(screen.getByRole('menuitem', { name: 'Edit' }));
  });

  it('asks who it was when the matcher gave up', async () => {
    await renderModal(UNASSIGNED_WATER);

    assert.match(
      screen.getByRole('dialog').textContent ?? '',
      /We couldn't tell which cat this was/,
    );
    /* Same word, same destination: an unassigned event and a wrongly-matched
       one are corrected on the one form. */
    assert.ok(screen.getByRole('button', { name: 'Edit' }));
    /* One answer, not two: there is no guess to agree with. */
    assert.equal(screen.queryByRole('button', { name: 'Looks right' }), null);
  });

  it('drops the band once the event is settled, and marks the face', async () => {
    const user = userEvent.setup();
    await renderModal(VERIFIED_VISIT);

    assert.equal(screen.queryByRole('button', { name: 'Looks right' }), null);
    /* The timeline's verified glyph on the avatar, not a sentence beside the
       time: a settled event is a quiet fact, not an announcement. */
    assert.ok(screen.getByLabelText('Verified by you'));
    assert.equal(screen.queryByText('Verified by you'), null);
    /* Nothing is asking any more, so the way back in is a late second thought
       under the kebab — same word the band used. */
    assert.equal(screen.queryByRole('button', { name: 'Edit' }), null);
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    assert.ok(screen.getByRole('menuitem', { name: 'Edit' }));
  });

  it('keeps Edit under the kebab even while the band is asking', async () => {
    /* The band's Edit is an invitation beside the question, not the only
       door: the menu's copy stays put so the way in never moves. */
    const user = userEvent.setup();
    await renderModal(GUESSED_VISIT);

    assert.ok(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    assert.ok(screen.getByRole('menuitem', { name: 'Edit' }));
  });

  it('draws no separator when Delete is all the menu holds', async () => {
    /* A scoop has no cat to re-decide, no signal and no clip: Delete stands
       alone, and a rule over an empty section would read as chrome. */
    const user = userEvent.setup();
    await renderModal(SCOOP);

    await user.click(screen.getByRole('button', { name: 'More actions' }));
    const menu = screen.getByRole('menu');
    assert.deepEqual(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
      ['Delete Event'],
    );
    assert.equal(within(menu).queryByRole('separator'), null);
  });

  it('re-attributes the event through the edit form, and marks it verified', async () => {
    const user = userEvent.setup();
    await renderModal(GUESSED_VISIT);

    const form = await openEditForm(user);
    /* The cat picker is a listbox, not a row of radios: it has to carry a face
       per option, and it has to survive a household bigger than three. */
    await user.click(within(form).getByRole('combobox', { name: 'Cat' }));
    await user.click(screen.getByRole('option', { name: /Jazz/ }));
    await user.click(within(form).getByRole('button', { name: 'Save' }));

    await waitFor(() => assert.equal(writes().length, 1));
    assert.equal(writes()[0].method?.toLowerCase(), 'patch');
    assert.equal(writes()[0].url, '/events/12');
    const body = writes()[0].body as Record<string, unknown>;
    assert.equal(body.pet_id, 2);
    assert.equal(body.caused_by, 'pet');
    assert.equal(body.human_verified, true);
  });

  it('drops the stale segments when the elimination type is corrected', async () => {
    const user = userEvent.setup();
    await renderModal(GUESSED_VISIT);

    const form = await openEditForm(user);
    /* The same picker the cat field uses: one form, one language. */
    await user.click(within(form).getByRole('combobox', { name: 'Type' }));
    await user.click(screen.getByRole('option', { name: 'Defecation' }));
    await user.click(within(form).getByRole('button', { name: 'Save' }));

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
    await renderModal(GUESSED_VISIT);

    const form = await openEditForm(user);
    await user.click(
      within(form).getByRole('checkbox', { name: 'Straining observed' }),
    );
    await user.click(within(form).getByRole('button', { name: 'Save' }));

    await waitFor(() => assert.equal(writes().length, 1));
    const body = writes()[0].body as {
      data: { straining: boolean; segments?: unknown };
    };
    assert.equal(body.data.straining, true);
    assert.notEqual(body.data.segments, null);
  });

  it('offers re-analysis only once the weight has actually changed', async () => {
    const user = userEvent.setup();
    await renderModal(GUESSED_VISIT);

    const form = await openEditForm(user);
    const reanalyze = /Re-analyze later visits/;
    assert.equal(
      within(form).queryByRole('checkbox', { name: reanalyze }),
      null,
    );

    await user.type(
      within(form).getByRole('spinbutton', { name: 'Cat weight' }),
      '4.20',
    );

    /* Cats are told apart by weight, so this edit — and only this edit — can
       re-identify every later visit on the device. Defaulted on, because
       under-showing it silently corrupts what comes after. */
    const followUp = within(form).getByRole('checkbox', { name: reanalyze });
    assert.equal((followUp as HTMLInputElement).checked, true);
  });

  it('never offers re-analysis for a cat or type edit', async () => {
    const user = userEvent.setup();
    await renderModal(GUESSED_VISIT);

    const form = await openEditForm(user);
    await user.click(within(form).getByRole('combobox', { name: 'Type' }));
    await user.click(screen.getByRole('option', { name: 'Defecation' }));

    assert.equal(
      within(form).queryByRole('checkbox', {
        name: /Re-analyze later visits/,
      }),
      null,
    );
  });

  it('hands back a weight the bin took', async () => {
    const user = userEvent.setup();
    await renderModal(GUESSED_VISIT, {
      detail: {
        children: [
          {
            ...BASE,
            id: 99,
            pet_id: 1,
            caused_by: 'pet' as const,
            attributed_by: 'weight' as const,
            device_id: 4,
            timestamp: GUESSED_VISIT.timestamp,
            human_verified: false,
            raw_data: null,
            data: { type: 'weight_measurement' as const, weight: 4540 },
          },
        ],
      },
    });

    const form = await openEditForm(user);
    const weight = within(form).getByRole('spinbutton', { name: 'Cat weight' });
    assert.equal((weight as HTMLInputElement).value, '4.54');

    /* Removing is one tap with no confirm, which is only honest while the tap
       is reversible — the reading is gone from the field immediately. */
    await user.click(
      within(form).getByRole('button', { name: 'Remove this weight' }),
    );
    assert.equal((weight as HTMLInputElement).value, '');
    assert.ok(
      within(form).getByRole('checkbox', { name: /Re-analyze later visits/ }),
    );

    await user.click(
      within(form).getByRole('button', { name: 'Restore 4.54 kg' }),
    );
    assert.equal((weight as HTMLInputElement).value, '4.54');
    /* Back at the stored reading is back at rest: nothing will be rewritten,
       so nothing downstream is at stake either. */
    assert.equal(
      within(form).queryByRole('checkbox', {
        name: /Re-analyze later visits/,
      }),
      null,
    );
    assert.ok(within(form).getByRole('button', { name: 'Remove this weight' }));
  });

  it('offers the stored reading back after any edit, not just the bin', async () => {
    const user = userEvent.setup();
    await renderModal(GUESSED_VISIT, {
      detail: {
        children: [
          {
            ...BASE,
            id: 99,
            pet_id: 1,
            caused_by: 'pet' as const,
            attributed_by: 'weight' as const,
            device_id: 4,
            timestamp: GUESSED_VISIT.timestamp,
            human_verified: false,
            raw_data: null,
            data: { type: 'weight_measurement' as const, weight: 4540 },
          },
        ],
      },
    });

    const form = await openEditForm(user);
    const weight = within(form).getByRole('spinbutton', { name: 'Cat weight' });

    await user.clear(weight);
    await user.type(weight, '4.10');

    /* Typing over a reading is as much a loss as binning it. */
    await user.click(
      within(form).getByRole('button', { name: 'Restore 4.54 kg' }),
    );
    assert.equal((weight as HTMLInputElement).value, '4.54');
  });

  it('writes a note without touching anything else on the event', async () => {
    const user = userEvent.setup();
    await renderModal(GUESSED_VISIT);

    await user.click(screen.getByRole('button', { name: 'Add a note…' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Note' }),
      'Litter changed this morning.',
    );
    await user.click(screen.getByRole('button', { name: 'Save note' }));

    await waitFor(() => assert.equal(writes().length, 1));
    assert.deepEqual(writes()[0].body, {
      note: 'Litter changed this morning.',
    });
  });

  it('shows a saved note with when it was written', async () => {
    await renderModal(GUESSED_VISIT, {
      detail: {
        note: 'Heavier scoop than usual.',
        note_updated_at: '2026-08-20T10:02:00.000Z',
      },
    });

    assert.ok(screen.getByText('Heavier scoop than usual.'));
    assert.ok(screen.getByRole('button', { name: 'Edit note' }));
  });

  it('asks before dropping an unsaved note, and closes only once told to', async () => {
    const user = userEvent.setup();
    let closed = 0;
    await renderModal(GUESSED_VISIT, { onClose: () => (closed += 1) });

    await user.click(screen.getByRole('button', { name: 'Add a note…' }));
    await user.type(screen.getByRole('textbox', { name: 'Note' }), 'Half a th');
    await user.keyboard('{Escape}');

    assert.equal(closed, 0);
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    assert.equal(closed, 1);
  });

  it('confirms a delete, and offers to re-identify what came after it', async () => {
    const user = userEvent.setup();
    await renderModal(GUESSED_VISIT);

    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete Event' }));

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
    await renderModal(GUESSED_VISIT, { withSignal: true });

    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Analyze' }));

    await waitFor(() => assert.equal(writes().length, 1));
    assert.equal(writes()[0].method?.toLowerCase(), 'post');
    assert.equal(writes()[0].url, '/events/12/analyze');
  });
});
