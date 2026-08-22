import * as React from 'react';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Checkbox } from '../Checkbox.tsx';
import { renderWithProviders } from '@/test/render.tsx';

afterEach(() => {
  cleanup();
});

/** Controlled by contract, like every other field in the kit. */
function Harness({
  initial = false,
  ...props
}: Partial<React.ComponentProps<typeof Checkbox>> & { initial?: boolean }) {
  const [checked, setChecked] = React.useState(initial);
  return <Checkbox checked={checked} onCheckedChange={setChecked} {...props} />;
}

describe('Checkbox', () => {
  it('is named by its own label', async () => {
    await renderWithProviders(<Harness label="Re-identify later visits" />);

    const box = screen.getByRole('checkbox', {
      name: 'Re-identify later visits',
    });
    assert.equal(box.getAttribute('checked'), null);

    await userEvent.click(box);
    assert.equal((box as HTMLInputElement).checked, true);
  });

  it('toggles from the keyboard', async () => {
    await renderWithProviders(<Harness label="Straining" />);

    const box = screen.getByRole('checkbox', { name: 'Straining' });
    box.focus();
    await userEvent.keyboard(' ');

    assert.equal((box as HTMLInputElement).checked, true);
  });

  it('can be named by a label that sits beside it', async () => {
    // Two surfaces put the text before the box, so the control has to work
    // without owning the text at all.
    await renderWithProviders(
      <>
        <label htmlFor="straining">Straining</label>
        <Harness id="straining" />
      </>,
    );

    assert.ok(screen.getByRole('checkbox', { name: 'Straining' }));
  });

  it('does not wrap a label around nothing', async () => {
    // A wrapping <label> with no text would add a second labelling
    // relationship for whatever already names the box.
    const { container } = await renderWithProviders(<Harness id="bare" />);

    assert.equal(container.querySelector('label'), null);
    assert.ok(container.querySelector('span.checkbox'));
  });

  it('refuses input when disabled', async () => {
    const seen: boolean[] = [];
    await renderWithProviders(
      <Checkbox
        checked={false}
        onCheckedChange={(next) => seen.push(next)}
        disabled
        label="Re-identify later visits"
      />,
    );

    const box = screen.getByRole('checkbox', {
      name: 'Re-identify later visits',
    });
    assert.equal(box.hasAttribute('disabled'), true);

    await userEvent.click(box);
    assert.deepEqual(seen, []);
  });
});
