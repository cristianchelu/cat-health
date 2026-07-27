import * as React from 'react';
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

  it('keeps the mobile title a plain span by default', async () => {
    // Most consumers render their own always-visible heading; promoting this
    // unconditionally would give those pages two <h1>s.
    await renderWithProviders(
      <PageBackLink to="/settings" label="Settings" mobileTitle="Providers" />,
      { router: { initialEntries: ['/settings/providers'] } },
    );

    assert.equal(screen.queryByRole('heading'), null);
    assert.equal(screen.getByText('Providers').tagName, 'SPAN');
  });

  it('promotes the mobile title to a heading on request', async () => {
    // Pages whose own <h1> is display:none on mobile need the title bar to
    // carry the heading, or the accessibility tree has none at that width.
    await renderWithProviders(
      <PageBackLink
        to="/devices"
        label="Devices"
        mobileTitle="Main Litterbox"
        mobileTitleAs="h1"
      />,
      { router: { initialEntries: ['/devices/1'] } },
    );

    const heading = screen.getByRole('heading', { level: 1 });
    assert.equal(heading.textContent, 'Main Litterbox');
    assert.ok(heading.classList.contains('page-back-title'));
  });

  it('forwards its ref and passes wrapper attributes through', async () => {
    const ref = React.createRef<HTMLDivElement>();
    await renderWithProviders(
      <PageBackLink
        ref={ref}
        to="/settings"
        label="Settings"
        id="providers-back"
        data-testid="back-bar"
        aria-label="Breadcrumb"
      />,
      { router: { initialEntries: ['/settings/providers'] } },
    );

    const bar = screen.getByTestId('back-bar');
    assert.equal(ref.current, bar);
    assert.equal(bar.id, 'providers-back');
    assert.equal(bar.getAttribute('aria-label'), 'Breadcrumb');
    assert.ok(bar.classList.contains('page-back'));
  });
});
