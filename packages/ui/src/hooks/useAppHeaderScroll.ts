import * as React from 'react';

/**
 * The app bar's scroll behaviour, phone-only.
 *
 * Reading a page on a phone is mostly reading; the chrome that got you there is
 * dead weight once you are in. So the header rides the scroll: it slides away as
 * you go down, comes back when you nudge up, and — with `revealTabsOnly` — comes
 * back as *just* the strip along its bottom edge, because switching tabs is the
 * one thing you actually do mid-page.
 *
 * It writes `transform` straight onto the element rather than through state. A
 * scroll handler that re-rendered the page on every frame would cost more than
 * the header is worth, and the value is never read back by React.
 */

/** The `max-width: 767px` breakpoint every mobile rule in the app is written against. */
const MOBILE_QUERY = '(max-width: 767px)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** Long enough to tell "the scroll ended" from "the finger paused". */
const SNAP_DELAY_MS = 140;
/** How long a revealed header lingers before `autoHide` takes it away again. */
const AUTO_HIDE_DELAY_MS = 1400;

const SNAP_TRANSITION = 'transform 0.22s ease';
const AUTO_HIDE_TRANSITION = 'transform 0.28s ease';

interface AppHeaderScrollOptions {
  /** Take the header away again a beat after it has settled part-way open. */
  autoHide: boolean;
  /** A nudge up brings back the trailing row only, not the title above it. */
  revealTabsOnly: boolean;
}

/**
 * The element that actually scrolls, which is `main` — but only usually. Routes
 * that opt into `.page-viewport-fill` turn `main` into an `overflow: hidden`
 * flex column and scroll something further in, so this walks rather than
 * assumes. Falling through to the document keeps a header outside the app shell
 * (a test tree, a preview) from throwing.
 *
 * It asks what the element is *allowed* to do, not whether it currently
 * overflows: this runs on mount, when the page is usually still a spinner and
 * nothing is tall enough to scroll yet.
 */
function findScroller(from: HTMLElement): HTMLElement | null {
  let el = from.parentElement;
  while (el) {
    if (/(auto|scroll)/.test(getComputedStyle(el).overflowY)) return el;
    el = el.parentElement;
  }
  return null;
}

function useAppHeaderScroll(
  rootRef: React.RefObject<HTMLElement | null>,
  rowRef: React.RefObject<HTMLElement | null>,
  { autoHide, revealTabsOnly }: AppHeaderScrollOptions,
): void {
  /*
   * Read the flags through a ref: flipping one mid-page should change what the
   * next scroll does, not tear down the listener and lose where the header sat.
   */
  const optionsRef = React.useRef({ autoHide, revealTabsOnly });
  React.useEffect(() => {
    optionsRef.current = { autoHide, revealTabsOnly };
  }, [autoHide, revealTabsOnly]);

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof window.matchMedia !== 'function') return;

    const mobile = window.matchMedia(MOBILE_QUERY);
    const reducedMotion = window.matchMedia(REDUCED_MOTION_QUERY);

    const bind = () => {
      const scroller = findScroller(root);
      const target: EventTarget = scroller ?? window;
      const readTop = () =>
        scroller
          ? scroller.scrollTop
          : (document.scrollingElement ?? document.documentElement).scrollTop;

      let offset = 0;
      let lastTop = readTop();
      let snapTimer: number | undefined;
      let hideTimer: number | undefined;

      const move = (next: number, transition: string | null) => {
        offset = next;
        root.style.transition =
          transition && !reducedMotion.matches ? transition : 'none';
        root.style.transform = `translateY(${-next}px)`;
      };

      /*
       * How far up the header rests when it is "open". Zero normally; with
       * `revealTabsOnly`, everything above the trailing row stays tucked away,
       * so a nudge up buys back the tabs and not the title. Only once you are
       * past the header entirely — until then, open means open.
       */
      const restingOffset = (top: number, height: number) => {
        const row = rowRef.current;
        if (!optionsRef.current.revealTabsOnly || !row || top <= height) {
          return 0;
        }
        return Math.max(0, height - row.offsetHeight);
      };

      const settle = () => {
        const top = readTop();
        const height = root.offsetHeight;
        const floor = restingOffset(top, height);
        // Past halfway and clear of the top of the page: finish the job.
        const snap =
          offset > (height + floor) / 2 && top > height ? height : floor;
        move(snap, SNAP_TRANSITION);

        if (!optionsRef.current.autoHide || snap >= height || top <= height) {
          return;
        }
        hideTimer = window.setTimeout(() => {
          const full = root.offsetHeight;
          // Don't yank the header out from under someone using it.
          if (readTop() <= full || root.contains(document.activeElement))
            return;
          move(full, AUTO_HIDE_TRANSITION);
        }, AUTO_HIDE_DELAY_MS);
      };

      const onScroll = () => {
        const top = readTop();
        const delta = top - lastTop;
        lastTop = top;
        const height = root.offsetHeight;
        const floor = restingOffset(top, height);

        let next = Math.max(floor, Math.min(height, offset + delta));
        /*
         * Near the top of the page there is nothing for the header to hide
         * behind — pin it to how far you have actually scrolled, or it detaches
         * and floats over content that hasn't moved.
         */
        if (top < height) next = Math.min(next, Math.max(0, top));
        move(next, null);

        window.clearTimeout(snapTimer);
        window.clearTimeout(hideTimer);
        snapTimer = window.setTimeout(settle, SNAP_DELAY_MS);
      };

      const reveal = () => {
        window.clearTimeout(hideTimer);
        move(0, SNAP_TRANSITION);
      };

      target.addEventListener('scroll', onScroll, { passive: true });
      root.addEventListener('focusin', reveal);

      return () => {
        target.removeEventListener('scroll', onScroll);
        root.removeEventListener('focusin', reveal);
        window.clearTimeout(snapTimer);
        window.clearTimeout(hideTimer);
        root.style.transition = '';
        root.style.transform = '';
      };
    };

    let detach: (() => void) | null = mobile.matches ? bind() : null;

    /* Rotating a phone or dragging a desktop window across the breakpoint. */
    const sync = () => {
      if (mobile.matches === !!detach) return;
      if (detach) {
        detach();
        detach = null;
      } else {
        detach = bind();
      }
    };

    mobile.addEventListener('change', sync);
    return () => {
      mobile.removeEventListener('change', sync);
      detach?.();
    };
  }, [rootRef, rowRef]);
}

export { useAppHeaderScroll, type AppHeaderScrollOptions };
