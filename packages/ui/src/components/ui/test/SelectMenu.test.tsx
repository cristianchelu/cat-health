import * as React from 'react';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  SelectMenu,
  SelectMenuContent,
  SelectMenuGroup,
  SelectMenuItem,
  SelectMenuLabel,
  SelectMenuSeparator,
  SelectMenuTrigger,
  SelectMenuValue,
} from '../SelectMenu.tsx';
import { renderWithProviders } from '@/test/render.tsx';

/* What the rich select is for: options that a native `<option>` cannot hold —
   a picture, a second line, a section they belong to — while still behaving
   like one control that yields one value. Held by roles and accessible names;
   the skin is not the contract. */

afterEach(() => {
  cleanup();
});

/** Controlled, as a form field would be. */
function Harness({
  onValueChange,
  initial = '',
}: {
  onValueChange?: (value: string) => void;
  initial?: string;
}) {
  const [value, setValue] = React.useState(initial);
  return (
    <SelectMenu
      value={value === '' ? undefined : value}
      onValueChange={(next) => {
        setValue(next);
        onValueChange?.(next);
      }}
    >
      <SelectMenuTrigger aria-label="Pet">
        <SelectMenuValue placeholder="Pick a pet" />
      </SelectMenuTrigger>
      <SelectMenuContent>
        <SelectMenuGroup>
          <SelectMenuLabel>Household</SelectMenuLabel>
          <SelectMenuItem
            value="luna"
            leading={<span aria-hidden="true">L</span>}
            subline="4.1–4.4 kg"
          >
            Luna
          </SelectMenuItem>
          <SelectMenuItem value="jazz" subline="5.0–5.2 kg">
            Jazz
          </SelectMenuItem>
        </SelectMenuGroup>
        <SelectMenuSeparator />
        <SelectMenuGroup>
          <SelectMenuLabel>Visiting</SelectMenuLabel>
          <SelectMenuItem value="mango" disabled>
            Mango
          </SelectMenuItem>
        </SelectMenuGroup>
      </SelectMenuContent>
    </SelectMenu>
  );
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('combobox', { name: 'Pet' }));
  return await screen.findByRole('listbox');
}

describe('SelectMenu', () => {
  it('starts on the placeholder and opens a listbox of every option', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<Harness />);

    assert.match(
      screen.getByRole('combobox', { name: 'Pet' }).textContent ?? '',
      /Pick a pet/,
    );

    const listbox = await openMenu(user);
    assert.equal(within(listbox).getAllByRole('option').length, 3);
    assert.ok(within(listbox).getByRole('option', { name: /Luna/ }));
    assert.ok(within(listbox).getByRole('option', { name: /Jazz/ }));
    assert.ok(within(listbox).getByRole('option', { name: /Mango/ }));
  });

  /*
   * Radix names an option from its `ItemText` alone, so without wiring the
   * subline up as a description it is drawn on screen and announced to nobody.
   * The name stays the label — the description is the extra.
   */
  it('announces a subline as the option’s description, not its name', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<Harness />);

    const listbox = await openMenu(user);
    assert.ok(
      within(listbox).getByRole('option', {
        name: 'Luna',
        description: '4.1–4.4 kg',
      }),
    );
  });

  it('groups options under their section heading', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<Harness />);

    const listbox = await openMenu(user);
    const groups = within(listbox).getAllByRole('group');
    assert.deepEqual(
      groups.map((group) => group.getAttribute('aria-labelledby') !== null),
      [true, true],
    );
    assert.ok(within(groups[0]).getByRole('option', { name: /Luna/ }));
    assert.ok(within(groups[1]).getByRole('option', { name: /Mango/ }));
  });

  it('reports the value you pick and shows only its label in the trigger', async () => {
    const user = userEvent.setup();
    const picked: string[] = [];
    await renderWithProviders(
      <Harness onValueChange={(v) => picked.push(v)} />,
    );

    const listbox = await openMenu(user);
    await user.click(within(listbox).getByRole('option', { name: /Luna/ }));

    assert.deepEqual(picked, ['luna']);
    await waitFor(() => {
      const trigger = screen.getByRole('combobox', { name: 'Pet' });
      assert.match(trigger.textContent ?? '', /Luna/);
      /* The subline stays in the list. It is context for choosing, not the
         value, and a two-line trigger would break the form row's rhythm. */
      assert.doesNotMatch(trigger.textContent ?? '', /kg/);
    });
  });

  it('marks the chosen option as selected and leaves the rest unselected', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<Harness initial="jazz" />);

    const listbox = await openMenu(user);
    assert.equal(
      within(listbox)
        .getByRole('option', { name: /Jazz/ })
        .getAttribute('aria-selected'),
      'true',
    );
    assert.notEqual(
      within(listbox)
        .getByRole('option', { name: /Luna/ })
        .getAttribute('aria-selected'),
      'true',
    );
  });

  it('refuses a disabled option', async () => {
    const user = userEvent.setup();
    const picked: string[] = [];
    await renderWithProviders(
      <Harness onValueChange={(v) => picked.push(v)} />,
    );

    const listbox = await openMenu(user);
    await user.click(within(listbox).getByRole('option', { name: /Mango/ }));

    assert.deepEqual(picked, []);
  });
});
