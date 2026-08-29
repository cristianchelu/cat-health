import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from '../Popover.tsx';
import { renderWithProviders } from '@/test/render.tsx';

/* What the popover is for: an anchored surface holding whatever the caller
   needs, with the trigger and the panel staying one control to a screen
   reader. Held by roles and names — the panel's geometry is Radix's. */

afterEach(() => {
  cleanup();
});

function Harness({ label = 'View options' }: { label?: string }) {
  return (
    <Popover>
      <PopoverTrigger>{label}</PopoverTrigger>
      <PopoverContent aria-label={label}>
        <button type="button">Group by day</button>
        <PopoverClose>Done</PopoverClose>
      </PopoverContent>
    </Popover>
  );
}

describe('Popover', () => {
  it('stays shut until its trigger is pressed', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<Harness />);

    assert.equal(screen.queryByRole('dialog'), null);

    await user.click(screen.getByRole('button', { name: 'View options' }));

    const panel = await screen.findByRole('dialog', { name: 'View options' });
    assert.ok(
      panel.contains(screen.getByRole('button', { name: 'Group by day' })),
    );
  });

  it('says whether it is open on the trigger itself', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<Harness />);

    const trigger = screen.getByRole('button', { name: 'View options' });
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');

    await user.click(trigger);
    await waitFor(() => {
      assert.equal(trigger.getAttribute('aria-expanded'), 'true');
    });
  });

  it('closes from the inside, and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<Harness />);

    const trigger = screen.getByRole('button', { name: 'View options' });
    await user.click(trigger);
    await screen.findByRole('dialog');

    await user.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() => {
      assert.equal(screen.queryByRole('dialog'), null);
      assert.equal(document.activeElement, trigger);
    });
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<Harness />);

    await user.click(screen.getByRole('button', { name: 'View options' }));
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');

    await waitFor(() => {
      assert.equal(screen.queryByRole('dialog'), null);
    });
  });

  it('portals the panel out of the trigger, so an overflow-clipped row cannot cut it off', async () => {
    const user = userEvent.setup();
    const { container } = await renderWithProviders(<Harness />);

    await user.click(screen.getByRole('button', { name: 'View options' }));
    const panel = await screen.findByRole('dialog');

    assert.equal(container.contains(panel), false);
    assert.equal(document.body.contains(panel), true);
  });
});
