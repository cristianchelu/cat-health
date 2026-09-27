import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { FormTile } from '../FormTile.tsx';
import { renderWithProviders } from '@/test/render.tsx';

afterEach(() => {
  cleanup();
});

describe('FormTile', () => {
  it('keeps an error behind a mark in the row and announces it', async () => {
    await renderWithProviders(
      <FormTile label="Zero scale" error="The device refused the change">
        <button type="button">Run</button>
      </FormTile>,
    );

    assert.equal(
      screen.getByRole('alert').textContent,
      'The device refused the change',
    );
    const mark = screen.getByRole('button', {
      name: 'The device refused the change',
    });
    await userEvent.setup().click(mark);

    const panel = await screen.findByRole('dialog', {
      name: 'The device refused the change',
    });
    assert.ok(panel.textContent?.includes('The device refused the change'));
  });

  it('shows no mark without an error', async () => {
    await renderWithProviders(
      <FormTile label="Zero scale">
        <button type="button">Run</button>
      </FormTile>,
    );
    assert.deepEqual(
      screen.getAllByRole('button').map((button) => button.textContent),
      ['Run'],
    );
  });
});
