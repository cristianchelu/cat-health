import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { GetPetResponseDTO, SettingControl } from 'shared';

import { DeviceSettingsSections } from '../DeviceSettingsSections.tsx';
import { renderWithProviders } from '@/test/render.tsx';

afterEach(() => {
  cleanup();
});

const PETS: GetPetResponseDTO[] = [
  { id: 1, name: 'Jazz', breed: '', birth_date: null, is_away: false },
  { id: 2, name: 'Luna', breed: '', birth_date: null, is_away: false },
];

// Jazz is linked to tag 11; tag 99 is the household's test tag, linked to
// nobody; Luna has no tag at all.
const petsSetting: SettingControl = {
  key: 'pets',
  label: { text: 'Pets' },
  type: {
    kind: 'identities',
    options: [
      { id: '11', label: 'Jazzy', pet_id: 1 },
      { id: '99', label: 'Test tag', pet_id: null },
    ],
  },
  value: ['11', '99'],
  placement: 'setting',
  group: 'primary',
};

/** The pets query is seeded so the container renders without a fetch. */
async function renderPets(onChange: (key: string, value: unknown) => void) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(['pets'], PETS);
  await renderWithProviders(
    <QueryClientProvider client={client}>
      <DeviceSettingsSections
        settings={[petsSetting]}
        draft={{ pets: ['11', '99'] }}
        onChange={onChange}
        invalidKeys={[]}
        disabled={false}
        accountId={5}
      />
    </QueryClientProvider>,
    { router: { initialEntries: ['/devices/14'] } },
  );
}

/** The tile that names `pet`; test copy has no aria labels to query by. */
function tileFor(pet: string): HTMLElement {
  const tile = screen.getByText(pet).closest('.form-tile');
  assert.ok(tile instanceof HTMLElement);
  return tile;
}

const switchFor = (pet: string): HTMLInputElement =>
  within(tileFor(pet)).getByRole('checkbox') as HTMLInputElement;

describe('DevicePetsSetting', () => {
  it('draws linked identities as pets, unlinked ones by name, and locks unseen pets', async () => {
    await renderPets(() => {});

    const jazz = switchFor('Jazz');
    const testTag = switchFor('Test tag');
    const luna = switchFor('Luna');
    assert.equal(jazz.checked, true);
    assert.equal(jazz.disabled, false);
    assert.ok(screen.getByText('Jazzy'));
    assert.equal(testTag.checked, true);
    assert.equal(testTag.disabled, false);
    assert.equal(luna.checked, false);
    assert.equal(luna.disabled, true);
    assert.equal(within(tileFor('Jazz')).queryByRole('button'), null);
  });

  it('explains an unlinked tag behind its help glyph, with the way to link it', async () => {
    await renderPets(() => {});
    const user = userEvent.setup();

    await user.click(within(tileFor('Test tag')).getByRole('button'));

    const panel = await screen.findByRole('dialog');
    assert.ok(
      within(panel).getByRole('button', {
        name: 'devices.controls.pets_link_account',
      }),
    );
  });

  it('drafts a flipped switch as the new set of identities', async () => {
    const changes: unknown[] = [];
    await renderPets((key, value) => changes.push([key, value]));

    await userEvent.setup().click(switchFor('Test tag'));

    assert.deepEqual(changes, [['pets', ['11']]]);
  });
});
