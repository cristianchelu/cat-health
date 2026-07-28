import * as React from 'react';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router';

import { PageHeader } from '../PageHeader.tsx';
import { renderWithProviders } from '@/test/render.tsx';

afterEach(() => {
  cleanup();
});

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="pathname">{location.pathname}</span>;
}

describe('PageHeader', () => {
  it('gives the page exactly one heading, whatever the width', async () => {
    // The regression this component exists for: the mobile title bar used to be
    // a second node carrying a second string, so /settings/devices read
    // "← Settings" on desktop and "← Devices" on mobile. CSS moves this one
    // heading between grid areas, so there is nothing to fall out of sync.
    await renderWithProviders(
      <PageHeader
        back={{ to: '/settings', label: 'Settings' }}
        title="Devices"
      />,
      { router: { initialEntries: ['/settings/devices'] } },
    );

    const headings = screen.getAllByRole('heading', { level: 1 });
    assert.equal(headings.length, 1);
    assert.equal(headings[0].textContent, 'Devices');
  });

  it('names the back control after where it lands, not the current page', async () => {
    await renderWithProviders(
      <PageHeader
        back={{ to: '/settings', label: 'Settings' }}
        title="Devices"
      />,
      { router: { initialEntries: ['/settings/devices'] } },
    );

    // Both variants are in the DOM; only `display: none` (applied by CSS, not
    // available in jsdom) hides one. Assert on the shared accessible name so
    // the count stays meaningful: exactly two controls, same name, same target.
    const controls = screen.getAllByRole('link', { name: 'Settings' });
    assert.equal(controls.length, 2);
    for (const control of controls) {
      assert.equal(control.getAttribute('href'), '/settings');
    }
    assert.equal(screen.queryAllByRole('link', { name: 'Devices' }).length, 0);
  });

  it('navigates back through history when asked to', async () => {
    const user = userEvent.setup();
    await renderWithProviders(
      <>
        <PageHeader back={{ useHistory: true, label: 'Back' }} title="Kibble" />
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

  it('runs its own guard instead of navigating, when given one', async () => {
    const user = userEvent.setup();
    let left = 0;
    await renderWithProviders(
      <>
        <PageHeader
          back={{ to: '/settings/providers', onNavigate: () => (left += 1), label: 'Providers' }}
          title="Add a provider"
        />
        <LocationProbe />
      </>,
      { router: { initialEntries: ['/settings/providers/new'] } },
    );

    // `onNavigate` wins over `to`: a wizard has to ask before it discards a
    // half-filled form, which a plain <Link> would never give it the chance to.
    await user.click(screen.getAllByRole('button', { name: 'Providers' })[0]);
    assert.equal(left, 1);
    assert.equal(
      screen.getByTestId('pathname').textContent,
      '/settings/providers/new',
    );
  });

  it('renders actions exactly once across both layouts', async () => {
    await renderWithProviders(
      <PageHeader
        back={{ to: '/settings', label: 'Settings' }}
        title="Devices"
        actions={<button type="button">Add device</button>}
      />,
      { router: { initialEntries: ['/settings/devices'] } },
    );

    // The back control is mounted twice and toggled with CSS; actions must not
    // be, or every page ships two of each button to assistive tech.
    assert.equal(screen.getAllByRole('button', { name: 'Add device' }).length, 1);
  });

  it('stands alone without a back control', async () => {
    await renderWithProviders(<PageHeader title="Settings" />, {
      router: { initialEntries: ['/settings'] } },
    );

    assert.equal(screen.getByRole('heading', { level: 1 }).textContent, 'Settings');
    assert.equal(screen.queryByRole('link'), null);
    assert.equal(screen.queryByRole('button'), null);
  });

  it('forwards its ref and passes wrapper attributes through', async () => {
    const ref = React.createRef<HTMLElement>();
    await renderWithProviders(
      <PageHeader
        ref={ref}
        back={{ to: '/settings', label: 'Settings' }}
        title="Providers"
        id="providers-header"
        data-testid="header"
      />,
      { router: { initialEntries: ['/settings/providers'] } },
    );

    const header = screen.getByTestId('header');
    assert.equal(ref.current, header);
    assert.equal(header.id, 'providers-header');
    assert.ok(header.classList.contains('page-header'));
  });
});
