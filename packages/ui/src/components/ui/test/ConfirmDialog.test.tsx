import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ConfirmDialog } from '../ConfirmDialog.tsx';
import { renderWithProviders } from '@/test/render.tsx';

afterEach(() => {
  cleanup();
});

describe('ConfirmDialog', () => {
  it('disables actions while confirming', async () => {
    await renderWithProviders(
      <ConfirmDialog
        open
        title="Delete pet?"
        isConfirming
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    assert.equal(
      screen.getByRole('button', { name: 'Cancel' }).hasAttribute('disabled'),
      true,
    );
    assert.equal(
      screen.getByRole('button', { name: 'Confirm' }).hasAttribute('disabled'),
      true,
    );
  });

  it('dismisses with Escape when not confirming', async () => {
    const user = userEvent.setup();
    let cancelled = false;

    await renderWithProviders(
      <ConfirmDialog
        open
        title="Delete pet?"
        onConfirm={() => {}}
        onCancel={() => {
          cancelled = true;
        }}
      />,
    );

    await user.keyboard('{Escape}');
    assert.equal(cancelled, true);
  });

  it('blocks Escape dismiss while confirming', async () => {
    const user = userEvent.setup();
    let cancelled = false;

    await renderWithProviders(
      <ConfirmDialog
        open
        title="Delete pet?"
        isConfirming
        onConfirm={() => {}}
        onCancel={() => {
          cancelled = true;
        }}
      />,
    );

    await user.keyboard('{Escape}');
    assert.equal(cancelled, false);
    assert.ok(screen.getByText('Delete pet?'));
  });
});
