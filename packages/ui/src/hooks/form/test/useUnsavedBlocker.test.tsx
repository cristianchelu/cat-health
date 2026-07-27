import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import * as React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, useNavigate } from 'react-router';

import { useUnsavedBlocker } from '../useUnsavedBlocker.ts';

afterEach(() => {
  cleanup();
});

function LeaveGuardProbe({ isDirty }: { isDirty: boolean }) {
  const navigate = useNavigate();
  const { blockerOpen, onConfirmLeave, onCancelLeave, markSaved } =
    useUnsavedBlocker(isDirty);

  return (
    <div>
      <button type="button" onClick={() => navigate('/other')}>
        Leave
      </button>
      <button
        type="button"
        onClick={() => {
          markSaved();
          navigate('/other');
        }}
      >
        Save and leave
      </button>
      <p data-testid="blocker">{blockerOpen ? 'open' : 'closed'}</p>
      {blockerOpen ? (
        <div>
          <button type="button" onClick={onConfirmLeave}>
            Confirm leave
          </button>
          <button type="button" onClick={onCancelLeave}>
            Stay
          </button>
        </div>
      ) : null}
    </div>
  );
}

function renderWithDirty(isDirty: boolean) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <LeaveGuardProbe isDirty={isDirty} />,
      },
      {
        path: '/other',
        element: <p data-testid="other">Other page</p>,
      },
    ],
    { initialEntries: ['/'] },
  );

  return {
    router,
    ...render(<RouterProvider router={router} />),
  };
}

describe('useUnsavedBlocker', () => {
  it('does not block navigation when clean', async () => {
    const user = userEvent.setup();
    renderWithDirty(false);

    await user.click(screen.getByRole('button', { name: 'Leave' }));

    assert.ok(await screen.findByTestId('other'));
  });

  it('blocks navigation when dirty and confirm proceeds', async () => {
    const user = userEvent.setup();
    renderWithDirty(true);

    await user.click(screen.getByRole('button', { name: 'Leave' }));
    assert.equal(screen.getByTestId('blocker').textContent, 'open');
    assert.equal(screen.queryByTestId('other'), null);

    await user.click(screen.getByRole('button', { name: 'Confirm leave' }));
    assert.ok(await screen.findByTestId('other'));
  });

  it('blocks navigation when dirty and stay resets the blocker', async () => {
    const user = userEvent.setup();
    renderWithDirty(true);

    await user.click(screen.getByRole('button', { name: 'Leave' }));
    assert.equal(screen.getByTestId('blocker').textContent, 'open');

    await user.click(screen.getByRole('button', { name: 'Stay' }));
    assert.equal(screen.getByTestId('blocker').textContent, 'closed');
    assert.equal(screen.queryByTestId('other'), null);
  });

  it('markSaved bypasses the blocker while still dirty', async () => {
    const user = userEvent.setup();
    renderWithDirty(true);

    await user.click(screen.getByRole('button', { name: 'Save and leave' }));

    assert.ok(await screen.findByTestId('other'));
    assert.equal(screen.queryByTestId('blocker'), null);
  });

  it('re-arms after markSaved once the form reports clean again', async () => {
    const user = userEvent.setup();

    // A form that stays mounted after saving: dirty lingers until the refetch
    // rebuilds its baseline, then the user edits again.
    function StayingProbe() {
      const [dirty, setDirty] = React.useState(true);
      const navigate = useNavigate();
      const { blockerOpen, markSaved } = useUnsavedBlocker(dirty);

      return (
        <div>
          <button type="button" onClick={() => markSaved()}>
            Save
          </button>
          <button type="button" onClick={() => setDirty(false)}>
            Refetch settles
          </button>
          <button type="button" onClick={() => setDirty(true)}>
            Edit again
          </button>
          <button type="button" onClick={() => navigate('/other')}>
            Leave
          </button>
          <p data-testid="blocker">{blockerOpen ? 'open' : 'closed'}</p>
        </div>
      );
    }

    const router = createMemoryRouter(
      [
        { path: '/', element: <StayingProbe /> },
        { path: '/other', element: <p data-testid="other">Other page</p> },
      ],
      { initialEntries: ['/'] },
    );
    render(<RouterProvider router={router} />);

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.click(screen.getByRole('button', { name: 'Refetch settles' }));
    await user.click(screen.getByRole('button', { name: 'Edit again' }));

    // The suppression from the earlier save must not still be in force.
    await user.click(screen.getByRole('button', { name: 'Leave' }));
    assert.equal(screen.getByTestId('blocker').textContent, 'open');
    assert.equal(screen.queryByTestId('other'), null);
  });
});
