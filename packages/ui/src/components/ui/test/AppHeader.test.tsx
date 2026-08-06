import * as React from 'react';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router';

import { AppHeader, AppHeaderBar, AppHeaderRow } from '../AppHeader.tsx';
import { backState } from '@/lib/navigationBack.ts';
import { renderWithProviders } from '@/test/render.tsx';

afterEach(() => {
  cleanup();
});

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="pathname">{location.pathname}</span>;
}

describe('AppHeaderBar', () => {
  it('gives the page exactly one heading, whatever the width', async () => {
    // The regression this component exists for: the mobile title bar used to be
    // a second node carrying a second string, so /settings/devices read
    // "← Settings" on desktop and "← Devices" on mobile. CSS moves this one
    // heading between grid areas, so there is nothing to fall out of sync.
    await renderWithProviders(
      <AppHeader>
        <AppHeaderBar
          back={{ to: '/settings', label: 'Settings' }}
          title="Devices"
        />
      </AppHeader>,
      { router: { initialEntries: ['/settings/devices'] } },
    );

    const headings = screen.getAllByRole('heading', { level: 1 });
    assert.equal(headings.length, 1);
    assert.equal(headings[0].textContent, 'Devices');
  });

  it('keeps the subtitle out of the heading', async () => {
    // The subtitle sits beside the <h1> in the title area, not inside it: a
    // page's accessible name is what it is called, not how many things it holds.
    await renderWithProviders(
      <AppHeader>
        <AppHeaderBar title="Devices" subtitle="3 devices" />
      </AppHeader>,
      { router: { initialEntries: ['/devices'] } },
    );

    const heading = screen.getByRole('heading', { level: 1 });
    assert.equal(heading.textContent, 'Devices');
    assert.ok(screen.getByText('3 devices'));
  });

  it('names the back control after where it lands, not the current page', async () => {
    await renderWithProviders(
      <AppHeader>
        <AppHeaderBar
          back={{ to: '/settings', label: 'Settings' }}
          title="Devices"
        />
      </AppHeader>,
      { router: { initialEntries: ['/settings/devices'] } },
    );

    // Both variants are in the DOM; only `display: none` (applied by CSS, not
    // available in jsdom) hides one. Assert on the shared accessible name so
    // the count stays meaningful: exactly two controls, same name.
    const controls = screen.getAllByRole('button', { name: 'Settings' });
    assert.equal(controls.length, 2);
    assert.equal(
      screen.queryAllByRole('button', { name: 'Devices' }).length,
      0,
    );
  });

  it('pops history for an in-app stack, using the fallback label when state is absent', async () => {
    const user = userEvent.setup();
    await renderWithProviders(
      <>
        <AppHeader>
          <AppHeaderBar
            back={{ to: '/settings/devices', label: 'Devices' }}
            title="Kibble"
          />
        </AppHeader>
        <LocationProbe />
      </>,
      {
        router: {
          initialEntries: ['/settings/devices', '/settings/devices/7'],
          initialIndex: 1,
        },
      },
    );

    assert.equal(
      screen.getByTestId('pathname').textContent,
      '/settings/devices/7',
    );
    await user.click(screen.getAllByRole('button', { name: 'Devices' })[0]);
    assert.equal(
      screen.getByTestId('pathname').textContent,
      '/settings/devices',
    );
  });

  it('shows state.back label and returns there on a cold start', async () => {
    const user = userEvent.setup();
    await renderWithProviders(
      <>
        <AppHeader>
          <AppHeaderBar
            back={{ to: '/settings/devices', label: 'Devices' }}
            title="Kibble"
          />
        </AppHeader>
        <LocationProbe />
      </>,
      {
        router: {
          initialEntries: [
            {
              pathname: '/settings/devices/7',
              state: backState('/settings/providers/3', 'SurePet'),
            },
          ],
        },
      },
    );

    assert.equal(screen.getAllByRole('button', { name: 'SurePet' }).length, 2);
    assert.equal(
      screen.queryAllByRole('button', { name: 'Devices' }).length,
      0,
    );
    await user.click(screen.getAllByRole('button', { name: 'SurePet' })[0]);
    assert.equal(
      screen.getByTestId('pathname').textContent,
      '/settings/providers/3',
    );
  });

  it('falls back to the canonical parent on a cold start with no state', async () => {
    const user = userEvent.setup();
    await renderWithProviders(
      <>
        <AppHeader>
          <AppHeaderBar
            back={{ to: '/settings/devices', label: 'Devices' }}
            title="Kibble"
          />
        </AppHeader>
        <LocationProbe />
      </>,
      { router: { initialEntries: ['/settings/devices/7'] } },
    );

    await user.click(screen.getAllByRole('button', { name: 'Devices' })[0]);
    assert.equal(
      screen.getByTestId('pathname').textContent,
      '/settings/devices',
    );
  });

  it('runs its own guard instead of navigating, when given one', async () => {
    const user = userEvent.setup();
    let left = 0;
    await renderWithProviders(
      <>
        <AppHeader>
          <AppHeaderBar
            back={{
              to: '/settings/providers',
              onNavigate: () => (left += 1),
              label: 'Providers',
            }}
            title="Add a provider"
          />
        </AppHeader>
        <LocationProbe />
      </>,
      { router: { initialEntries: ['/settings/providers/new'] } },
    );

    // `onNavigate` wins over history-aware leave: a wizard has to ask before
    // it discards a half-filled form.
    await user.click(screen.getAllByRole('button', { name: 'Providers' })[0]);
    assert.equal(left, 1);
    assert.equal(
      screen.getByTestId('pathname').textContent,
      '/settings/providers/new',
    );
  });

  it('renders actions exactly once across both layouts', async () => {
    await renderWithProviders(
      <AppHeader>
        <AppHeaderBar
          back={{ to: '/settings', label: 'Settings' }}
          title="Devices"
          actions={<button type="button">Add device</button>}
        />
      </AppHeader>,
      { router: { initialEntries: ['/settings/devices'] } },
    );

    // The back control is mounted twice and toggled with CSS; actions must not
    // be, or every page ships two of each button to assistive tech.
    assert.equal(
      screen.getAllByRole('button', { name: 'Add device' }).length,
      1,
    );
  });

  it('stands alone without a back control', async () => {
    await renderWithProviders(
      <AppHeader>
        <AppHeaderBar title="Settings" />
      </AppHeader>,
      { router: { initialEntries: ['/settings'] } },
    );

    assert.equal(
      screen.getByRole('heading', { level: 1 }).textContent,
      'Settings',
    );
    assert.equal(screen.queryByRole('link'), null);
    assert.equal(screen.queryByRole('button'), null);
  });

  it('keeps the one heading in the DOM when the bar is desktop-only', async () => {
    // `desktopOnly` is a CSS switch, not a second render path — the overview's
    // phone chrome is its pet strip, but the page is still called one thing.
    await renderWithProviders(
      <AppHeader>
        <AppHeaderBar desktopOnly title="Overview" />
        <AppHeaderRow>
          <button type="button">Mochi</button>
        </AppHeaderRow>
      </AppHeader>,
      { router: { initialEntries: ['/'] } },
    );

    const bar = screen.getByRole('heading', { level: 1 }).closest('div');
    assert.equal(screen.getAllByRole('heading', { level: 1 }).length, 1);
    assert.ok(
      bar
        ?.closest('.app-header-bar')
        ?.classList.contains('app-header-bar-desktop-only'),
    );
  });
});

describe('AppHeader', () => {
  it('renders the row it is given as the header’s own bottom edge', async () => {
    await renderWithProviders(
      <AppHeader>
        <AppHeaderBar title="Downstairs" />
        <AppHeaderRow>
          <button type="button">History</button>
        </AppHeaderRow>
      </AppHeader>,
      { router: { initialEntries: ['/devices/7'] } },
    );

    const row = screen.getByRole('button', { name: 'History' }).parentElement;
    assert.ok(row?.classList.contains('app-header-row'));
    assert.ok(row?.closest('.app-header'));
  });

  it('survives a header with nothing to reveal separately', async () => {
    // `revealTabsOnly` measures the row; without one there is nothing to keep
    // on screen, and the header simply hides in full.
    await renderWithProviders(
      <AppHeader revealTabsOnly>
        <AppHeaderBar title="Settings" />
      </AppHeader>,
      { router: { initialEntries: ['/settings'] } },
    );

    assert.equal(document.querySelectorAll('.app-header-row').length, 0);
    assert.equal(
      screen.getByRole('heading', { level: 1 }).textContent,
      'Settings',
    );
  });

  it('forwards its ref and passes wrapper attributes through', async () => {
    const ref = React.createRef<HTMLElement>();
    await renderWithProviders(
      <AppHeader ref={ref} id="providers-header" data-testid="header">
        <AppHeaderBar
          back={{ to: '/settings', label: 'Settings' }}
          title="Providers"
        />
      </AppHeader>,
      { router: { initialEntries: ['/settings/providers'] } },
    );

    const header = screen.getByTestId('header');
    assert.equal(ref.current, header);
    assert.equal(header.id, 'providers-header');
    assert.ok(header.classList.contains('app-header'));
  });
});
