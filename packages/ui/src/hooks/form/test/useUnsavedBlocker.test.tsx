import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, useNavigate } from 'react-router';

import { useUnsavedBlocker } from '../useUnsavedBlocker.ts';

afterEach(() => {
  cleanup();
});

function LeaveGuardProbe({ isDirty }: { isDirty: boolean }) {
  const navigate = useNavigate();
  const { blockerOpen, onConfirmLeave, onCancelLeave } =
    useUnsavedBlocker(isDirty);

  return (
    <div>
      <button type="button" onClick={() => navigate('/other')}>
        Leave
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
});
