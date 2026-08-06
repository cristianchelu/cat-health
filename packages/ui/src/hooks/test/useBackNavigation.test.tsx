import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';

import { backState } from '@/lib/navigationBack.ts';
import { useBackNavigation } from '../useBackNavigation.ts';

afterEach(() => {
  cleanup();
});

function BackProbe({ fallback }: { fallback: { to: string; label: string } }) {
  const location = useLocation();
  const back = useBackNavigation(fallback);

  return (
    <div>
      <span data-testid="pathname">{location.pathname}</span>
      <span data-testid="label">{back.label}</span>
      <span data-testid="to">{back.to}</span>
      <button type="button" onClick={back.go}>
        Leave
      </button>
    </div>
  );
}

function renderBack(options: {
  fallback: { to: string; label: string };
  initialEntries: Array<string | { pathname: string; state?: unknown }>;
  initialIndex?: number;
}) {
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: <BackProbe fallback={options.fallback} />,
      },
    ],
    {
      initialEntries: options.initialEntries,
      initialIndex: options.initialIndex,
    },
  );

  return {
    router,
    ...render(<RouterProvider router={router} />),
  };
}

describe('useBackNavigation', () => {
  it('uses the fallback target when location state has no back', async () => {
    renderBack({
      fallback: { to: '/settings/devices', label: 'Devices' },
      initialEntries: ['/settings/devices/7'],
    });

    assert.equal(screen.getByTestId('label').textContent, 'Devices');
    assert.equal(screen.getByTestId('to').textContent, '/settings/devices');
  });

  it('prefers state.back for label and destination', async () => {
    renderBack({
      fallback: { to: '/settings/devices', label: 'Devices' },
      initialEntries: [
        {
          pathname: '/settings/devices/7',
          state: backState('/settings/providers/3', 'SurePet'),
        },
      ],
    });

    assert.equal(screen.getByTestId('label').textContent, 'SurePet');
    assert.equal(screen.getByTestId('to').textContent, '/settings/providers/3');
  });

  it('pops history when the entry was reached in-app', async () => {
    const user = userEvent.setup();
    renderBack({
      fallback: { to: '/settings/devices', label: 'Devices' },
      initialEntries: ['/settings/providers/3', '/settings/devices/7'],
      initialIndex: 1,
    });

    assert.equal(
      screen.getByTestId('pathname').textContent,
      '/settings/devices/7',
    );
    await user.click(screen.getByRole('button', { name: 'Leave' }));
    assert.equal(
      screen.getByTestId('pathname').textContent,
      '/settings/providers/3',
    );
  });

  it('follows state.back even when history would pop somewhere else', async () => {
    // Add-device → Providers hint left the wizard under Providers. History-aware
    // -1 bounced back into the wizard while the label said Settings. Named
    // state.back must win so label and destination stay honest.
    const user = userEvent.setup();
    renderBack({
      fallback: { to: '/settings', label: 'Settings' },
      initialEntries: [
        '/settings/devices/new?account=3',
        {
          pathname: '/settings/providers',
          state: backState('/settings', 'Settings'),
        },
      ],
      initialIndex: 1,
    });

    assert.equal(screen.getByTestId('label').textContent, 'Settings');
    await user.click(screen.getByRole('button', { name: 'Leave' }));
    assert.equal(screen.getByTestId('pathname').textContent, '/settings');
  });

  it('navigates to the named target on a cold start', async () => {
    const user = userEvent.setup();
    renderBack({
      fallback: { to: '/settings/devices', label: 'Devices' },
      initialEntries: [
        {
          pathname: '/settings/devices/7',
          state: backState('/settings/providers/3', 'SurePet'),
        },
      ],
    });

    await user.click(screen.getByRole('button', { name: 'Leave' }));
    assert.equal(
      screen.getByTestId('pathname').textContent,
      '/settings/providers/3',
    );
  });

  it('navigates to the fallback on a cold start with no state', async () => {
    const user = userEvent.setup();
    renderBack({
      fallback: { to: '/settings/devices', label: 'Devices' },
      initialEntries: ['/settings/devices/7'],
    });

    await user.click(screen.getByRole('button', { name: 'Leave' }));
    assert.equal(
      screen.getByTestId('pathname').textContent,
      '/settings/devices',
    );
  });

  it('pops instead of pushing the fallback, so leave cannot bounce back into the abandoned page', async () => {
    // Provider → add-device wizard → abandon used to `navigate('/settings/devices')`,
    // which left the wizard under Devices. Devices' history-aware back then
    // returned to the wizard — a leave/back loop.
    const user = userEvent.setup();
    renderBack({
      fallback: { to: '/settings/devices', label: 'Devices' },
      initialEntries: [
        '/settings/providers/3',
        '/settings/devices/new?account=3',
      ],
      initialIndex: 1,
    });

    await user.click(screen.getByRole('button', { name: 'Leave' }));
    assert.equal(
      screen.getByTestId('pathname').textContent,
      '/settings/providers/3',
    );
  });
});
