import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { cleanup, screen } from '@testing-library/react';

import { FormTile } from '../FormTile.tsx';
import { renderWithProviders } from '@/test/render.tsx';

afterEach(() => {
  cleanup();
});

describe('FormTile', () => {
  it('names its control by its label', async () => {
    await renderWithProviders(
      <FormTile label="Pump" htmlFor="pump">
        <input id="pump" type="checkbox" />
      </FormTile>,
    );

    assert.ok(screen.getByRole('checkbox', { name: 'Pump' }));
  });

  it('announces a busy value inside the row, not on a line of its own', async () => {
    const { container } = await renderWithProviders(
      <FormTile label="Pump" busyLabel="Waiting for the device…">
        <input type="checkbox" />
      </FormTile>,
    );

    const status = screen.getByRole('status');
    assert.equal(status.textContent, 'Waiting for the device…');
    assert.ok(status.closest('.form-tile-row'));
    assert.equal(container.querySelectorAll('.form-tile > p').length, 0);
  });
});
