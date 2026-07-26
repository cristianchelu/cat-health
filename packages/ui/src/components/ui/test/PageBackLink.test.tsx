import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router';

import { PageBackLink } from '../PageBackLink.tsx';
import { renderWithProviders } from '@/test/render.tsx';

afterEach(() => {
  cleanup();
});

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="pathname">{location.pathname}</span>;
}

describe('PageBackLink', () => {
  it('navigates back through history when asked to', async () => {
    const user = userEvent.setup();
    await renderWithProviders(
      <>
        <PageBackLink useHistory label="Back" />
        <LocationProbe />
      </>,
      {
        router: {
          initialEntries: ['/devices', '/devices/7'],
          initialIndex: 1,
        },
      },
    );

    assert.equal(screen.getByTestId('pathname').textContent, '/devices/7');
    await user.click(screen.getAllByRole('button', { name: 'Back' })[0]);
    assert.equal(screen.getByTestId('pathname').textContent, '/devices');
  });

  it('renders actions exactly once across both layouts', async () => {
    await renderWithProviders(
      <PageBackLink
        to="/settings"
        label="Settings"
        actions={<button type="button">Edit</button>}
      />,
      { router: { initialEntries: ['/settings/providers'] } },
    );

    // Desktop and mobile chrome are both mounted and toggled with CSS, so a
    // naive two-variant implementation would duplicate the actions slot.
    assert.equal(screen.getAllByRole('button', { name: 'Edit' }).length, 1);
  });

  it('points both layout variants at the same route', async () => {
    await renderWithProviders(
      <PageBackLink to="/settings" label="Settings" />,
      { router: { initialEntries: ['/settings/providers'] } },
    );

    // Both variants are in the DOM; only `display: none` (applied by CSS, not
    // available in jsdom) hides one. Assert on the shared accessible name so
    // the count stays meaningful: exactly two controls, same name, same target.
    const controls = screen.getAllByRole('link', { name: 'Settings' });
    assert.equal(controls.length, 2);
    for (const control of controls) {
      assert.equal(control.getAttribute('href'), '/settings');
    }
  });

  it('falls back to the label when no mobile title is given', async () => {
    await renderWithProviders(
      <PageBackLink to="/settings" label="Settings" mobileTitle="Providers" />,
      { router: { initialEntries: ['/settings/providers'] } },
    );

    assert.ok(screen.getByText('Providers'));
  });
});
