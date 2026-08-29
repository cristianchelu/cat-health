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
    // A warning, a confirmation or a note that interrupts a screen reader
    // mid-task costs more than it tells; only the error tone is worth
    // breaking into what someone is doing.
    await renderWithProviders(
      <>
        <Callout tone="warning" message="Heads up" />
        <Callout tone="success" message="All linked" />
        <Callout tone="info" message="Worth knowing" />
      </>,
    );

    assert.equal(screen.queryByRole('alert'), null);
    assert.ok(screen.getByText('Heads up'));
    assert.ok(screen.getByText('All linked'));
    assert.ok(screen.getByText('Worth knowing'));
  });

  it('renders nothing without content, so callers can drop the guard', async () => {
    const { container } = await renderWithProviders(<Callout message={null} />);

    assert.equal(container.querySelector('.callout'), null);
  });

  it('names the severity with a glyph, not the tint alone', async () => {
    // Colour is the one signal a callout cannot rely on by itself.
    const { container } = await renderWithProviders(
      <Callout tone="warning" message="Unofficial API" />,
    );

    const glyph = container.querySelector('.callout-icon');
    assert.ok(glyph);
    assert.equal(glyph.getAttribute('aria-hidden'), 'true');
    assert.ok(glyph.querySelector('svg'));
  });

  it('holds the buttons that answer it', async () => {
    await renderWithProviders(
      <Callout
        tone="info"
        message="We couldn't tell which cat this was"
        actions={<button type="button">Fix…</button>}
      />,
    );

    assert.ok(screen.getByRole('button', { name: 'Fix…' }));
  });

  it('is what FormError is', async () => {
    await renderWithProviders(<FormError message="Name is required" />);

    const banner = screen.getByRole('alert');
    assert.equal(banner.textContent, 'Name is required');
    assert.ok(banner.classList.contains('callout'));
    assert.ok(banner.classList.contains('error'));
  });
});
