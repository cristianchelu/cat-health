import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { FormShell } from '../FormShell.tsx';
import { renderWithProviders } from '@/test/render.tsx';

afterEach(() => {
  cleanup();
});

describe('FormShell', () => {
  it('submits the form and shows an error banner', async () => {
    const user = userEvent.setup();
    let submitted = false;

    await renderWithProviders(
      <FormShell
        error="Save failed"
        onSubmit={(event) => {
          event.preventDefault();
          submitted = true;
        }}
        actions={{
          onCancel: () => {},
          cancelLabel: 'Cancel',
          submitLabel: 'Save',
        }}
      >
        <input name="name" defaultValue="Mochi" />
      </FormShell>,
    );

    const alert = screen.getByRole('alert');
    assert.equal(alert.textContent, 'Save failed');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    assert.equal(submitted, true);
  });
});
