import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { FormActions } from '../FormActions.tsx';
import { renderWithProviders } from '@/test/render.tsx';

afterEach(() => {
  cleanup();
});

describe('FormActions', () => {
  it('disables Cancel and Save while submitting and exposes busy', async () => {
    await renderWithProviders(
      <FormActions
        onCancel={() => {}}
        cancelLabel="Cancel"
        submitLabel="Save"
        isSubmitting
      />,
    );

    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const save = screen.getByRole('button', { name: 'Save' });
    assert.equal(cancel.hasAttribute('disabled'), true);
    assert.equal(save.hasAttribute('disabled'), true);
    assert.equal(save.getAttribute('aria-busy'), 'true');
  });

  it('honors independent submitDisabled and cancelDisabled', async () => {
    const user = userEvent.setup();
    let cancelled = false;
    let submitted = false;

    await renderWithProviders(
      <FormActions
        onCancel={() => {
          cancelled = true;
        }}
        cancelLabel="Cancel"
        submitLabel="Save"
        submitType="button"
        submitDisabled
        cancelDisabled={false}
        onSubmitClick={() => {
          submitted = true;
        }}
      />,
    );

    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const save = screen.getByRole('button', { name: 'Save' });
    assert.equal(cancel.hasAttribute('disabled'), false);
    assert.equal(save.hasAttribute('disabled'), true);

    await user.click(cancel);
    assert.equal(cancelled, true);
    assert.equal(submitted, false);
  });
});
