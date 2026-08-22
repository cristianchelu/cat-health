import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MediaTile } from '../MediaTile.tsx';
import { renderWithProviders } from '@/test/render.tsx';

afterEach(() => {
  cleanup();
});

describe('MediaTile', () => {
  it('is a button when it does something', async () => {
    const clicks: number[] = [];
    await renderWithProviders(
      <MediaTile
        src="a.webp"
        alt="A snapshot"
        onClick={() => clicks.push(1)}
      />,
    );

    // The grids this replaced used a clickable <div>, so none of them could be
    // reached from a keyboard at all.
    const tile = screen.getByRole('button', { name: 'A snapshot' });
    await userEvent.click(tile);
    tile.focus();
    await userEvent.keyboard('{Enter}');

    assert.equal(clicks.length, 2);
  });

  it('is not a button when it only displays', async () => {
    await renderWithProviders(<MediaTile src="a.webp" alt="A snapshot" />);

    assert.equal(screen.queryByRole('button'), null);
    assert.ok(screen.getByAltText('A snapshot'));
  });

  it('reports selection to assistive tech, not just with a border', async () => {
    await renderWithProviders(
      <MediaTile src="a.webp" alt="A snapshot" selected onClick={() => {}} />,
    );

    assert.equal(
      screen
        .getByRole('button', { name: 'A snapshot' })
        .getAttribute('aria-pressed'),
      'true',
    );
  });

  it('stops responding while a request is in flight against it', async () => {
    await renderWithProviders(
      <MediaTile src="a.webp" alt="A snapshot" busy onClick={() => {}} />,
    );

    assert.equal(
      screen
        .getByRole('button', { name: 'A snapshot' })
        .hasAttribute('disabled'),
      true,
    );
  });

  it('falls back rather than showing a broken image', async () => {
    await renderWithProviders(
      <MediaTile alt="A snapshot" fallback={<span>no photo</span>} />,
    );

    assert.ok(screen.getByText('no photo'));
    assert.equal(screen.queryByAltText('A snapshot'), null);
  });
});
