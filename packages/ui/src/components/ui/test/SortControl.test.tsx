import * as React from 'react';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SortControl } from '../SortControl.tsx';
import type { SortDirection } from '@/lib/listSort.ts';
import { renderWithProviders } from '@/test/render.tsx';

afterEach(() => {
  cleanup();
});

const OPTIONS = [
  { value: 'type', label: 'Type' },
  { value: 'name', label: 'Name' },
] as const;

/** Controlled wrapper — the caller owns key and direction, as on a listing page. */
function Harness({
  onValueChange,
  onDirectionChange,
  ...props
}: Partial<React.ComponentProps<typeof SortControl<'type' | 'name'>>>) {
  const [value, setValue] = React.useState<'type' | 'name'>('type');
  const [direction, setDirection] = React.useState<SortDirection>('asc');
  return (
    <SortControl
      label="Sort by"
      options={OPTIONS}
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onValueChange?.(next);
      }}
      direction={direction}
      onDirectionChange={(next) => {
        setDirection(next);
        onDirectionChange?.(next);
      }}
      {...props}
    />
  );
}

describe('SortControl', () => {
  it('exposes a labelled sort select listing every option', async () => {
    await renderWithProviders(<Harness />);

    const select = screen.getByRole('combobox', { name: 'Sort by' });
    assert.deepEqual(
      [...select.querySelectorAll('option')].map((o) => o.textContent),
      ['Type', 'Name'],
    );
  });

  it('reports the chosen key', async () => {
    const user = userEvent.setup();
    const seen: string[] = [];
    await renderWithProviders(<Harness onValueChange={(v) => seen.push(v)} />);

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Sort by' }),
      'name',
    );

    assert.deepEqual(seen, ['name']);
  });

  it('names the direction button after the direction currently applied', async () => {
    await renderWithProviders(<Harness />);

    const button = screen.getByRole('button', { name: 'Ascending' });
    // A toolbar can sit inside a form; a bare <button> would submit it.
    assert.equal(button.getAttribute('type'), 'button');
  });

  it('flips the direction, and says so, when the button is pressed', async () => {
    const user = userEvent.setup();
    const seen: SortDirection[] = [];
    await renderWithProviders(
      <Harness onDirectionChange={(d) => seen.push(d)} />,
    );

    await user.click(screen.getByRole('button', { name: 'Ascending' }));
    assert.deepEqual(seen, ['desc']);

    await user.click(screen.getByRole('button', { name: 'Descending' }));
    assert.deepEqual(seen, ['desc', 'asc']);
  });
});
