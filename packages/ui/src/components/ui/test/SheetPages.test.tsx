import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { act, cleanup, render } from '@testing-library/react';

import { SheetPages } from '../SheetPages.tsx';
import { resetMediaMatches, setMediaMatches } from '@/test/matchMedia.ts';

/* jsdom never finishes a CSS transition, so the fallback timer IS the settle
   path here — and the test environment defaults to `prefers-reduced-motion`,
   which is the instant path. Each animated case opts itself in. */
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const PAST_THE_SLIDE_MS = 300;

afterEach(() => {
  cleanup();
  resetMediaMatches();
  mock.timers.reset();
});

function animate() {
  setMediaMatches(REDUCED_MOTION, false);
  mock.timers.enable({ apis: ['setTimeout'] });
}

function slots(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('.sheet-pages-slot')];
}

function settle() {
  act(() => {
    mock.timers.tick(PAST_THE_SLIDE_MS);
  });
}

describe('SheetPages', () => {
  it('swaps in place when motion is not wanted', () => {
    const { container, rerender } = render(
      <SheetPages page="a" depth={0}>
        <p>Page A</p>
      </SheetPages>,
    );

    rerender(
      <SheetPages page="b" depth={1}>
        <p>Page B</p>
      </SheetPages>,
    );

    /* Synchronously: no second page is ever mounted, so nothing a test does
       afterwards has to wait for an animation that cannot finish. */
    const only = slots(container);
    assert.equal(only.length, 1);
    assert.equal(only[0].dataset.state, 'current');
    assert.equal(only[0].textContent, 'Page B');
  });

  it('slides a deeper page in from the end, and the old one out', () => {
    animate();
    const { container, rerender } = render(
      <SheetPages page="a" depth={0}>
        <p>Page A</p>
      </SheetPages>,
    );

    rerender(
      <SheetPages page="b" depth={1}>
        <p>Page B</p>
      </SheetPages>,
    );

    const [current, leaving] = slots(container);
    assert.equal(slots(container).length, 2);
    /* Incoming first in document order: the keyed diff leaves the outgoing
       node where it was (scroll position intact) and the arriving page's own
       title wins the accessible name for the length of the slide. */
    assert.equal(current.dataset.state, 'current');
    assert.equal(current.textContent, 'Page B');
    assert.equal(leaving.dataset.state, 'leaving');
    assert.equal(leaving.textContent, 'Page A');
    assert.equal(leaving.getAttribute('aria-hidden'), 'true');
    assert.equal(leaving.hasAttribute('inert'), true);
    /* Forward: the new page arrives from the inline end, the old one leaves
       towards the start. */
    assert.equal(current.style.transform, 'translateX(0%)');
    assert.equal(leaving.style.transform, 'translateX(-100%)');

    settle();

    assert.equal(slots(container).length, 1);
    assert.equal(slots(container)[0].textContent, 'Page B');
    assert.equal(
      container.querySelector<HTMLElement>('.sheet-pages')!.style.height,
      '',
    );
  });

  it('sends a shallower page the other way, and treats a sideways move as forward', () => {
    animate();
    const { container, rerender } = render(
      <SheetPages page="b" depth={1}>
        <p>Page B</p>
      </SheetPages>,
    );

    rerender(
      <SheetPages page="a" depth={0}>
        <p>Page A</p>
      </SheetPages>,
    );

    assert.equal(slots(container)[1].style.transform, 'translateX(100%)');
    settle();

    rerender(
      <SheetPages page="c" depth={0}>
        <p>Page C</p>
      </SheetPages>,
    );

    /* Same rung, different page: nothing says "back", so it reads as going
       onwards. */
    assert.equal(slots(container)[1].style.transform, 'translateX(-100%)');
  });

  it('carries an interrupted slide into the next one', () => {
    animate();
    const { container, rerender } = render(
      <SheetPages page="a" depth={0}>
        <p>Page A</p>
      </SheetPages>,
    );

    rerender(
      <SheetPages page="b" depth={1}>
        <p>Page B</p>
      </SheetPages>,
    );
    /* Straight back out, before the first slide has landed. */
    rerender(
      <SheetPages page="a" depth={0}>
        <p>Page A</p>
      </SheetPages>,
    );

    const live = slots(container);
    assert.equal(live.length, 2);
    assert.equal(live[0].textContent, 'Page A');
    /* The interrupted arrival is what leaves — no third page is kept around. */
    assert.equal(live[1].textContent, 'Page B');

    settle();
    assert.equal(slots(container).length, 1);
    assert.equal(slots(container)[0].textContent, 'Page A');
  });

  it('snapshots what was actually on screen, not what first mounted', () => {
    animate();
    const { container, rerender } = render(
      <SheetPages page="a" depth={0}>
        <p>Page A</p>
      </SheetPages>,
    );

    rerender(
      <SheetPages page="a" depth={0}>
        <p>Page A, edited</p>
      </SheetPages>,
    );
    rerender(
      <SheetPages page="b" depth={1}>
        <p>Page B</p>
      </SheetPages>,
    );

    assert.equal(slots(container)[1].textContent, 'Page A, edited');
  });

  it('rescues focus from the page that is leaving, and leaves other focus alone', () => {
    animate();
    const { container, rerender } = render(
      <SheetPages page="a" depth={0}>
        <input aria-label="On page A" />
      </SheetPages>,
    );

    container.querySelector('input')!.focus();
    rerender(
      <SheetPages page="b" depth={1}>
        <p>Page B</p>
      </SheetPages>,
    );

    assert.equal(document.activeElement, slots(container)[0]);
    settle();

    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    rerender(
      <SheetPages page="c" depth={2}>
        <p>Page C</p>
      </SheetPages>,
    );

    /* Focus that went somewhere deliberate — a back button outside this
       component, often mid-repeated-press — is never taken away. */
    assert.equal(document.activeElement, outside);
    outside.remove();
  });
});
