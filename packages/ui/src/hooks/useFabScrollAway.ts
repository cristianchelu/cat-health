import * as React from 'react';

import { MOBILE_QUERY } from '@/lib/breakpoints';

/**
 * The mobile FAB's scroll behaviour: away on the way down, back on a nudge up.
 *
 * The FAB overlays the page rather than reserving a strip at the end of it, so
 * at the bottom of a list it would otherwise sit on top of the last card — and
 * under the thumb that just flicked there. Reading down is exactly when nobody
 * is adding anything, so it leaves; wanting it back reads as scrolling back up.
 * This is the same rhythm `useAppHeaderScroll` gives the app bar, on purpose:
 * one gesture takes the chrome away at both ends of the screen and one brings it
 * back.
 *
 * Deliberately *not* on a timer. Coming back once the scroll settles would put
 * it over the last card again the moment you stopped to read it, which is the
 * problem this exists to solve.
 *
 * It writes a data attribute rather than React state — the transition is CSS's
 * to run (including its `prefers-reduced-motion` opt-out), and re-rendering on
 * every scroll frame to move one button is a bad trade.
 */

/** Under this, it's the jitter of a finger at rest or a rubber-band settling. */
const DIRECTION_THRESHOLD_PX = 6;
/**
 * How far down the page the FAB starts obscuring something worth seeing. Near
 * the top there is nothing behind it yet, and hiding it there just makes the
 * first flick of a page feel like it broke something.
 */
const ENGAGE_AFTER_PX = 48;

const AWAY_ATTRIBUTE = 'data-scrolled-away';

/**
 * The page scroller, from the FAB layer's point of view.
 *
 * The layer is a *sibling* of the scroll area rather than a child of it, so
 * this looks sideways where `useAppHeaderScroll` looks up. `main` is the only
 * thing in the shell that scrolls a page; routes that opt into
 * `.page-viewport-fill` scroll something deeper instead, and there the FAB
 * simply stays put — none of them have one.
 */
function findPageScroller(layer: HTMLElement): HTMLElement | null {
  return layer.parentElement?.querySelector(':scope > main') ?? null;
}

/**
 * @param layerRef The element carrying the away state; the FAB lives inside it.
 * @param resetKey Changes when the page does. A FAB left hidden across a
 *   navigation can be unreachable on the page that follows: land on something
 *   short enough not to scroll and there is no upward nudge left to give.
 */
function useFabScrollAway(
  layerRef: React.RefObject<HTMLElement | null>,
  resetKey: string,
): void {
  React.useEffect(() => {
    const layer = layerRef.current;
    if (!layer || typeof window.matchMedia !== 'function') return;

    const mobile = window.matchMedia(MOBILE_QUERY);

    const bind = () => {
      const scroller = findPageScroller(layer);
      if (!scroller) return null;

      let lastTop = scroller.scrollTop;
      const setAway = (away: boolean) =>
        layer.toggleAttribute(AWAY_ATTRIBUTE, away);

      const onScroll = () => {
        const top = scroller.scrollTop;
        const delta = top - lastTop;
        /*
         * Leave `lastTop` where it is until the threshold is crossed, so a slow
         * drag accumulates into a direction instead of being read as a stall.
         */
        if (Math.abs(delta) < DIRECTION_THRESHOLD_PX) return;
        lastTop = top;
        setAway(delta > 0 && top > ENGAGE_AFTER_PX);
      };

      /*
       * A FAB that is scaled away is still in the tab order and still in the
       * accessibility tree, so focus can land on it while it is invisible —
       * bring it back rather than leaving someone pointed at nothing.
       */
      const reveal = () => setAway(false);

      scroller.addEventListener('scroll', onScroll, { passive: true });
      layer.addEventListener('focusin', reveal);

      return () => {
        scroller.removeEventListener('scroll', onScroll);
        layer.removeEventListener('focusin', reveal);
        setAway(false);
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
  }, [layerRef, resetKey]);
}

export { useFabScrollAway };
