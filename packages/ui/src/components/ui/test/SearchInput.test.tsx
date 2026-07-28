import * as React from 'react';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SearchInput } from '../SearchInput.tsx';
import { renderWithProviders } from '@/test/render.tsx';

afterEach(() => {
  cleanup();
});

/** Controlled wrapper — the component is a controlled input by contract. */
function Harness({
  initial = '',
  onValueChange,
  ...props
}: Partial<React.ComponentProps<typeof SearchInput>> & { initial?: string }) {
  const [value, setValue] = React.useState(initial);
  return (
    <SearchInput
      label="Search devices"
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onValueChange?.(next);
      }}
      {...props}
    />
  );
}

describe('SearchInput', () => {
  it('exposes a labelled search box even without a visible label', async () => {
    await renderWithProviders(<Harness />);

    const input = screen.getByRole('searchbox', { name: 'Search devices' });
    assert.equal(input.getAttribute('type'), 'search');
  });

  it('reports each keystroke as the new value', async () => {
    const user = userEvent.setup();
    const seen: string[] = [];
    await renderWithProviders(<Harness onValueChange={(v) => seen.push(v)} />);

    await user.type(screen.getByRole('searchbox'), 'cam');

    assert.deepEqual(seen, ['c', 'ca', 'cam']);
  });

  it('offers no clear affordance while the box is empty', async () => {
    await renderWithProviders(<Harness />);

    assert.equal(screen.queryByRole('button', { name: 'Clear' }), null);
  });

  it('clears to empty and hands focus back to the input', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<Harness initial="cam" clearLabel="Clear" />);

    await user.click(screen.getByRole('button', { name: 'Clear' }));

    const input = screen.getByRole<HTMLInputElement>('searchbox');
    assert.equal(input.value, '');
    // Clearing is a refinement of the search, not the end of it — losing focus
    // would force a second tap to keep typing.
    assert.equal(document.activeElement, input);
    assert.equal(screen.queryByRole('button', { name: 'Clear' }), null);
  });

  it('clears on Escape and keeps the key from reaching an enclosing dialog', async () => {
    const user = userEvent.setup();
    let escapesEscaped = 0;
    await renderWithProviders(
      <div onKeyDown={() => (escapesEscaped += 1)}>
        <Harness initial="cam" />
      </div>,
    );

    await user.click(screen.getByRole('searchbox'));
    await user.keyboard('{Escape}');

    assert.equal(screen.getByRole<HTMLInputElement>('searchbox').value, '');
    assert.equal(escapesEscaped, 0);
  });

  it('lets Escape bubble when there is nothing to clear', async () => {
    const user = userEvent.setup();
    let escapesEscaped = 0;
    await renderWithProviders(
      <div onKeyDown={() => (escapesEscaped += 1)}>
        <Harness />
      </div>,
    );

    await user.click(screen.getByRole('searchbox'));
    await user.keyboard('{Escape}');

    // Swallowing it unconditionally would trap the user in a modal whose only
    // dismissal is the key this field ate.
    assert.equal(escapesEscaped, 1);
  });

  it('forwards its ref to the input and passes attributes through', async () => {
    const ref = React.createRef<HTMLInputElement>();
    await renderWithProviders(
      <SearchInput
        ref={ref}
        label="Search"
        value=""
        onValueChange={() => {}}
        placeholder="Search devices"
        id="device-search"
      />,
    );

    const input = screen.getByRole<HTMLInputElement>('searchbox');
    assert.equal(ref.current, input);
    assert.equal(input.id, 'device-search');
    assert.equal(input.getAttribute('placeholder'), 'Search devices');
  });
});
