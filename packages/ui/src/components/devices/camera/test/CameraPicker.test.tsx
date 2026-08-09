import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CameraPicker } from '../CameraPicker.tsx';
import { renderWithProviders } from '@/test/render.tsx';

afterEach(() => {
  cleanup();
});

describe('CameraPicker', () => {
  it('offers a None tile that reports null when chosen', async () => {
    const user = userEvent.setup();
    const seen: Array<number | null> = [];

    await renderWithProviders(
      <CameraPicker
        open
        onOpenChange={() => {}}
        title="Choose a camera"
        cameras={[
          { id: 6, name: 'Hall camera' },
          { id: 7, name: 'Litterbox Camera' },
        ]}
        selectedCameraId={6}
        onSelect={(id) => seen.push(id)}
        noneLabel="None"
        emptyLabel="No cameras available"
      />,
    );

    await user.click(screen.getByRole('radio', { name: 'None' }));
    assert.deepEqual(seen, [null]);
  });

  it('exposes the tiles as a radiogroup with checked state', async () => {
    await renderWithProviders(
      <CameraPicker
        open
        onOpenChange={() => {}}
        title="Choose a camera"
        cameras={[
          { id: 6, name: 'Hall camera' },
          { id: 7, name: 'Litterbox Camera' },
        ]}
        selectedCameraId={6}
        onSelect={() => {}}
        noneLabel="None"
        emptyLabel="No cameras available"
      />,
    );

    assert.ok(screen.getByRole('radiogroup', { name: 'Choose a camera' }));
    assert.equal(
      screen
        .getByRole('radio', { name: 'Hall camera' })
        .getAttribute('aria-checked'),
      'true',
    );
    assert.equal(
      screen
        .getByRole('radio', { name: 'Litterbox Camera' })
        .getAttribute('aria-checked'),
      'false',
    );
    assert.equal(
      screen.getByRole('radio', { name: 'None' }).getAttribute('aria-checked'),
      'false',
    );
  });

  it('marks None as checked when no camera id is set', async () => {
    await renderWithProviders(
      <CameraPicker
        open
        onOpenChange={() => {}}
        title="Choose a camera"
        cameras={[{ id: 6, name: 'Hall camera' }]}
        selectedCameraId={null}
        onSelect={() => {}}
        noneLabel="None"
        emptyLabel="No cameras available"
      />,
    );

    assert.equal(
      screen.getByRole('radio', { name: 'None' }).getAttribute('aria-checked'),
      'true',
    );
  });

  it('still selects a concrete camera by id', async () => {
    const user = userEvent.setup();
    const seen: Array<number | null> = [];

    await renderWithProviders(
      <CameraPicker
        open
        onOpenChange={() => {}}
        title="Choose a camera"
        cameras={[{ id: 6, name: 'Hall camera' }]}
        selectedCameraId={null}
        onSelect={(id) => seen.push(id)}
        noneLabel="None"
        emptyLabel="No cameras available"
      />,
    );

    await user.click(screen.getByRole('radio', { name: 'Hall camera' }));
    assert.deepEqual(seen, [6]);
  });

  it('shows the empty label instead of tiles when there are no cameras', async () => {
    await renderWithProviders(
      <CameraPicker
        open
        onOpenChange={() => {}}
        title="Choose a camera"
        cameras={[]}
        selectedCameraId={null}
        onSelect={() => {}}
        noneLabel="None"
        emptyLabel="No cameras available"
      />,
    );

    assert.ok(screen.getByText('No cameras available'));
    assert.equal(screen.queryByRole('radiogroup'), null);
    assert.equal(screen.queryByRole('radio'), null);
  });
});
