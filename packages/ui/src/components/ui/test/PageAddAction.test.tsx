import * as React from 'react';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { Link } from 'react-router';

import { PageAddFab, PageAddFabSlot } from '../PageAddAction.tsx';
import { renderWithProviders } from '@/test/render.tsx';

let restoreMatchMedia: (() => void) | null = null;

afterEach(() => {
  cleanup();
  restoreMatchMedia?.();
  restoreMatchMedia = null;
});

/**
 * The FAB's behaviour is phone-only and gated on `matchMedia`, which jsdom
 * answers `false` to for everything.
 */
function pretendWidth(mobile: boolean) {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: mobile && query.includes('max-width: 767px'),
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  restoreMatchMedia = () => {
    window.matchMedia = original;
  };
}

/** The shape of the app shell the FAB layer reads: a scrolling `main` beside it. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div id="app">
      <main data-testid="scroller">
        <div id="content">{children}</div>
      </main>
      <PageAddFabSlot />
    </div>
  );
}

function scrollTo(top: number) {
  const scroller = screen.getByTestId('scroller');
  scroller.scrollTop = top;
  fireEvent.scroll(scroller);
}

const layer = () => document.getElementById('page-add-fab-slot');
const isAway = () => layer()?.hasAttribute('data-scrolled-away') === true;

async function renderShellWithFab() {
  await renderWithProviders(
    <Shell>
      <div className="page">
        <PageAddFab to="/devices/new" label="Add device" />
      </div>
    </Shell>,
    { router: { initialEntries: ['/devices'] } },
  );
  return screen.getByRole('link', { name: 'Add device' });
}

describe('PageAddFab', () => {
  it('mounts in the shell layer rather than in the page', async () => {
    // The regression it exists for: as the last element of the page it added
    // its own height to the scroll, and on a page too short to scroll there was
    // nothing for `position: sticky` to hold it against.
    pretendWidth(true);
    const fab = await renderShellWithFab();

    assert.equal(fab.closest('#page-add-fab-slot'), layer());
    assert.equal(fab.closest('#content'), null);
  });

  it('goes away on the way down the page and comes back on a nudge up', async () => {
    pretendWidth(true);
    await renderShellWithFab();

    assert.equal(isAway(), false);

    scrollTo(400);
    assert.equal(isAway(), true);

    scrollTo(340);
    assert.equal(isAway(), false);
  });

  it('stays put near the top, where it covers nothing yet', async () => {
    pretendWidth(true);
    await renderShellWithFab();

    scrollTo(20);
    assert.equal(isAway(), false);
  });

  it('reads a slow drag as a direction, not as a stall', async () => {
    // Each step is under the jitter threshold; together they are a scroll down.
    pretendWidth(true);
    await renderShellWithFab();

    for (const top of [60, 64, 68, 72]) scrollTo(top);
    assert.equal(isAway(), true);
  });

  it('comes back when focus lands on it', async () => {
    // Scaled away it is still in the tab order, so focus can reach a button
    // nobody can see.
    pretendWidth(true);
    const fab = await renderShellWithFab();

    scrollTo(400);
    assert.equal(isAway(), true);

    fireEvent.focusIn(fab);
    assert.equal(isAway(), false);
  });

  it('comes back for the next page', async () => {
    // A FAB left hidden across a navigation can be stranded: land on a page too
    // short to scroll and there is no upward nudge left to bring it back.
    pretendWidth(true);
    await renderWithProviders(
      <Shell>
        <div className="page">
          <Link to="/health">Health</Link>
          <PageAddFab to="/devices/new" label="Add device" />
        </div>
      </Shell>,
      { router: { initialEntries: ['/devices'] } },
    );

    scrollTo(400);
    assert.equal(isAway(), true);

    fireEvent.click(screen.getByRole('link', { name: 'Health' }));
    assert.equal(isAway(), false);
  });

  it('leaves the button alone on a desktop', async () => {
    // There the header carries the add action and the layer is display:none.
    pretendWidth(false);
    await renderShellWithFab();

    scrollTo(400);
    assert.equal(isAway(), false);
  });

  it('renders in place when there is no shell to mount into', async () => {
    // A page under test, a preview — the FAB should still be reachable.
    pretendWidth(true);
    await renderWithProviders(
      <div className="page">
        <PageAddFab to="/devices/new" label="Add device" />
      </div>,
      { router: { initialEntries: ['/devices'] } },
    );

    const fab = screen.getByRole('link', { name: 'Add device' });
    assert.equal(fab.closest('.page')?.className, 'page');
  });
});
