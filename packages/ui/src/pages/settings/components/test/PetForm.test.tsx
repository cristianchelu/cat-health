import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { createDefaultSettingsResponse, type GetPetResponseDTO } from 'shared';

import PetForm, { type PetFormSubmit } from '../PetForm.tsx';
import RegionalPreferencesProvider from '@/contexts/RegionalPreferencesProvider';
import { renderWithProviders } from '@/test/render.tsx';

const MITTENS: GetPetResponseDTO = {
  id: 1,
  name: 'Mittens',
  breed: 'Domestic shorthair',
  birth_date: '2019-04-02',
  microchip: null,
  sex: 'female',
  altered: 'altered',
  presence: { state: 'home' },
  closed_at: null,
};

const queryClients: QueryClient[] = [];

afterEach(() => {
  cleanup();
  for (const client of queryClients.splice(0)) client.clear();
});

interface Spies {
  submitted: PetFormSubmit[];
  closed: number;
  deleted: number;
}

async function renderPetForm(pet: GetPetResponseDTO | undefined = MITTENS) {
  const spies: Spies = { submitted: [], closed: 0, deleted: 0 };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClients.push(client);
  client.setQueryData(['settings'], createDefaultSettingsResponse());

  // `useUnsavedBlocker` needs a data router; a plain MemoryRouter will not do.
  const router = createMemoryRouter(
    [
      {
        path: '/settings/pets/:id',
        element: (
          <PetForm
            pet={pet}
            onSubmit={async (values) => {
              spies.submitted.push(values);
              return true;
            }}
            onCancel={() => {}}
            onCloseProfile={async () => {
              spies.closed += 1;
            }}
            onReopenProfile={async () => {}}
            onDelete={() => {
              spies.deleted += 1;
            }}
          />
        ),
      },
      { path: '/settings', element: <p>settings</p> },
    ],
    { initialEntries: ['/settings/pets/1'] },
  );

  await renderWithProviders(
    <QueryClientProvider client={client}>
      <RegionalPreferencesProvider>
        <RouterProvider router={router} />
      </RegionalPreferencesProvider>
    </QueryClientProvider>,
  );
  return spies;
}

const saveButton = () => screen.getByRole('button', { name: 'Save Changes' });

describe('PetForm', () => {
  it('keeps Save disabled until something changes', async () => {
    const user = userEvent.setup();
    await renderPetForm();

    assert.equal(saveButton().hasAttribute('disabled'), true);
    await user.type(screen.getByLabelText(/^Breed/), ' mix');
    assert.equal(saveButton().hasAttribute('disabled'), false);
  });

  it('names the altered field after the pet’s sex', async () => {
    const user = userEvent.setup();
    await renderPetForm();

    assert.ok(screen.getByLabelText('Spayed'));
    await user.selectOptions(screen.getByLabelText('Sex'), 'male');
    assert.ok(screen.getByLabelText('Neutered'));
  });

  it('sends a presence change', async () => {
    const user = userEvent.setup();
    const spies = await renderPetForm();

    await user.selectOptions(screen.getByLabelText('Pet presence'), 'vet');
    await user.click(saveButton());
    assert.deepEqual(spies.submitted[0]?.presence, {
      state: 'away',
      context: 'vet',
    });
  });

  it('sends no presence when only other fields changed', async () => {
    const user = userEvent.setup();
    const spies = await renderPetForm();

    await user.type(screen.getByLabelText(/^Breed/), ' mix');
    await user.click(saveButton());
    assert.equal(spies.submitted[0]?.presence, null);
  });

  it('counts a picked photo as a change', async () => {
    const user = userEvent.setup();
    await renderPetForm();

    const [, chooseInput] =
      document.body.querySelectorAll('input[type="file"]');
    assert.ok(chooseInput instanceof HTMLInputElement);
    await user.upload(
      chooseInput,
      new File(['x'], 'mittens.png', { type: 'image/png' }),
    );
    assert.equal(saveButton().hasAttribute('disabled'), false);
  });

  it('confirms before closing the profile and before deleting', async () => {
    const user = userEvent.setup();
    const spies = await renderPetForm();

    await user.click(screen.getByRole('button', { name: 'Close…' }));
    await user.click(screen.getByRole('button', { name: 'Close profile' }));
    assert.equal(spies.closed, 1);

    await user.click(screen.getByRole('button', { name: 'Delete…' }));
    assert.equal(spies.deleted, 0);
    await user.click(screen.getByRole('button', { name: 'Delete forever' }));
    assert.equal(spies.deleted, 1);
  });

  it('hides presence and offers Reopen once the profile is closed', async () => {
    await renderPetForm({
      ...MITTENS,
      presence: { state: 'away', context: 'profile_closed' },
      closed_at: '2026-10-20T09:00:00.000Z',
    });

    assert.equal(screen.queryByLabelText('Pet presence'), null);
    assert.ok(screen.getByRole('button', { name: 'Reopen' }));
  });
});
