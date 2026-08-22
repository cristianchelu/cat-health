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
  type GetPetResponseDTO,
} from 'shared';

import AnnotationWorkspace from '../AnnotationWorkspace.tsx';
import apiClient from '@/api/apiClient';
import RegionalPreferencesProvider from '@/contexts/RegionalPreferencesProvider';
import { renderWithProviders } from '@/test/render.tsx';

/* Only as deep as Phase 8 needs: the control row and what dirty means. The
   chart and the bout drag are explicitly out of scope — `AGENTS.md` protects
   that draft, and nothing in the sweep goes near it. */

const queryClients: QueryClient[] = [];
const writes: { method?: string; url?: string; body: unknown }[] = [];

/* Installed for the life of the process — see LogFoodSheet's test for why a
   restore mid-run lets a late refetch escape to the network. */
apiClient.defaults.adapter = async (config) => {
  const method = config.method?.toLowerCase();
  if (method !== 'get') {
    writes.push({
      method,
      url: config.url,
      body:
        typeof config.data === 'string' ? JSON.parse(config.data) : config.data,
    });
  }
  const url = config.url ?? '';
  const data = url.includes('/pets')
    ? PETS
    : url.includes('/settings')
      ? createDefaultSettingsResponse()
      : url.endsWith('/media')
        ? []
        : detail();
  return { data, status: 200, statusText: 'OK', headers: {}, config };
};

afterEach(() => {
  cleanup();
  writes.length = 0;
  for (const client of queryClients.splice(0)) {
    client.clear();
  }
});

const PETS: GetPetResponseDTO[] = [
  { id: 1, name: 'Luna', breed: 'Ragdoll', birth_date: null, is_away: false },
  { id: 2, name: 'Jazz', breed: 'Bengal', birth_date: null, is_away: false },
];

const VISIT: GetEventListItemDTO = {
  id: 55,
  parent_event_id: null,
  pet_id: 1,
  caused_by: 'pet',
  attributed_by: 'weight',
  device_id: 7,
  timestamp: '2026-08-20T09:00:00.000Z',
  data: {
    type: 'litterbox_use',
    elimination_type: 'urination',
    elimination_weight: 30,
    duration: 40,
    straining: false,
  },
  human_verified: false,
};

/** The detail fetch, which is where the weight signal comes from. */
function detail() {
  return {
    ...VISIT,
    raw_data: Array.from(
      encodeLitterboxRawData({
        version: LITTERBOX_RAW_DATA_VERSION_2,
        startTimeMs: Date.UTC(2026, 7, 20, 9, 0, 0),
        weights: [4100, 4400, 4420, 4380, 4120],
        sampleOffsetsMs: [0, 137, 274, 411, 548],
      }),
    ),
    children: [],
  };
}

async function renderWorkspace(
  onDirtyChange: (dirty: boolean) => void = () => {},
) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  queryClients.push(client);

  const view = await renderWithProviders(
    <QueryClientProvider client={client}>
      <RegionalPreferencesProvider>
        <AnnotationWorkspace
          event={VISIT}
          videoOpen={false}
          onVideoOpenChange={() => {}}
          onDirtyChange={onDirtyChange}
        />
      </RegionalPreferencesProvider>
    </QueryClientProvider>,
  );

  /* The pets arrive over the wire, and the attribution select is empty of
     names until they do. */
  await waitFor(() =>
    assert.ok(screen.queryAllByRole('option', { name: 'Luna' }).length > 0),
  );
  return view;
}

/* The control labels sit beside their select rather than naming it, so each is
   found by what it offers — which is also what has to survive `ControlGroup`. */
function selectOffering(option: string): HTMLSelectElement {
  const found = screen
    .getAllByRole('combobox')
    .find((el) => within(el).queryByRole('option', { name: option })) as
    | HTMLSelectElement
    | undefined;
  assert.ok(found, `no select offers "${option}"`);
  return found;
}

function saveButton() {
  return screen.getByRole('button', { name: 'Save Changes' });
}

describe('AnnotationWorkspace', () => {
  it('offers the visit as it stands, with nothing to save', async () => {
    await renderWorkspace();

    assert.equal(selectOffering('Luna').value, 'pet:1');
    assert.equal(selectOffering('Urination').value, 'urination');
    assert.equal(
      screen.getByLabelText('Straining').hasAttribute('checked'),
      false,
    );
    assert.equal(saveButton().hasAttribute('disabled'), true);
  });

  it('reports dirty upward the moment an edit is made, and clean again after Save', async () => {
    /* The tab above uses this to guard switching visits and leaving the route,
       so it is the contract that matters, not the local button state. */
    const user = userEvent.setup();
    const seen: boolean[] = [];
    await renderWorkspace((dirty) => seen.push(dirty));

    await user.selectOptions(selectOffering('Defecation'), 'defecation');

    await waitFor(() => assert.equal(seen.at(-1), true));
    assert.equal(saveButton().hasAttribute('disabled'), false);

    await user.click(saveButton());

    await waitFor(() => assert.equal(seen.at(-1), false));
  });

  it('saves the visit as one patch: attribution, type, straining and bouts', async () => {
    const user = userEvent.setup();
    await renderWorkspace();

    await user.selectOptions(selectOffering('Jazz'), 'pet:2');
    await user.selectOptions(selectOffering('Defecation'), 'defecation');
    await user.click(screen.getByLabelText('Straining'));
    await user.click(saveButton());

    await waitFor(() => assert.equal(writes.length, 1));
    assert.equal(writes[0].method, 'patch');
    assert.equal(writes[0].url, '/events/55');
    const body = writes[0].body as {
      pet_id: number;
      caused_by: string;
      human_verified: boolean;
      data: {
        elimination_type: string;
        straining: boolean;
        segments: unknown;
        annotation: { bouts: unknown[]; excluded: boolean };
      };
    };
    assert.equal(body.pet_id, 2);
    assert.equal(body.caused_by, 'pet');
    assert.equal(body.data.elimination_type, 'defecation');
    assert.equal(body.data.straining, true);
    /* The type changed, so the analyzer's segments no longer describe it. */
    assert.equal(body.data.segments, null);
    assert.deepEqual(body.data.annotation.bouts, []);
    /* Saving an edit is not the same as saying a human reviewed it — that is
       the verify button's job. */
    assert.equal(body.human_verified, false);
  });

  it('puts verifying and re-analyzing out of reach while there are unsaved edits', async () => {
    const user = userEvent.setup();
    await renderWorkspace();

    const verify = screen.getByRole('button', { name: 'Mark as Verified' });
    const analyze = screen.getByRole('button', { name: 'Analyze' });
    assert.equal(verify.hasAttribute('disabled'), false);

    await user.selectOptions(selectOffering('Defecation'), 'defecation');

    /* Both write the event server-side; either would overwrite the draft. */
    await waitFor(() => assert.equal(verify.hasAttribute('disabled'), true));
    assert.equal(analyze.hasAttribute('disabled'), true);
  });

  it('takes Cancel as putting the visit back the way it was', async () => {
    const user = userEvent.setup();
    await renderWorkspace();

    await user.selectOptions(selectOffering('Defecation'), 'defecation');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    /* Cancel on a dirty visit asks first — the same prompt the tab shows when
       you try to switch visits with edits pending. */
    await user.click(screen.getByRole('button', { name: 'Discard' }));

    await waitFor(() =>
      assert.equal(selectOffering('Urination').value, 'urination'),
    );
    assert.equal(saveButton().hasAttribute('disabled'), true);
    assert.equal(writes.length, 0);
  });

  it('says when a visit has no bouts yet', async () => {
    await renderWorkspace();

    assert.ok(screen.getByText(/No bouts detected/));
  });
});
