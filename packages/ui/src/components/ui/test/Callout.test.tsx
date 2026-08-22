import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { cleanup, screen } from '@testing-library/react';

import { Callout } from '../Callout.tsx';
import { FormError } from '../form/FormError.tsx';
import { renderWithProviders } from '@/test/render.tsx';

afterEach(() => {
  cleanup();
});

describe('Callout', () => {
  it('announces an error', async () => {
    await renderWithProviders(<Callout message="Could not save" />);

    assert.equal(screen.getByRole('alert').textContent, 'Could not save');
  });

  it('stays quiet for anything that is not an error', async () => {
    // A warning that interrupts a screen reader mid-task costs more than it
    // tells; only the error tone is worth breaking into what someone is doing.
    await renderWithProviders(<Callout tone="warning" message="Heads up" />);

    assert.equal(screen.queryByRole('alert'), null);
    assert.ok(screen.getByText('Heads up'));
  });

  it('renders nothing without content, so callers can drop the guard', async () => {
    const { container } = await renderWithProviders(<Callout message={null} />);

    assert.equal(container.querySelector('.callout'), null);
  });

  it('is what FormError is', async () => {
    await renderWithProviders(<FormError message="Name is required" />);

    const banner = screen.getByRole('alert');
    assert.equal(banner.textContent, 'Name is required');
    assert.ok(banner.classList.contains('callout'));
    assert.ok(banner.classList.contains('error'));
  });
});
