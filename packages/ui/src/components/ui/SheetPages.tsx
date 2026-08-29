import * as React from 'react';

import { cn } from '@/lib/utils';
import './SheetPages.css';

/*
 * Inline from TS rather than tokens: the settle timer needs the number in JS,
 * and inline styles are what reliably win over whatever a consumer's own CSS
 * puts on these nodes. Between `--transition-fast` and `--transition-normal`
 * on purpose — a ladder is walked several rungs at a time, and at 250ms the
 * walk went gummy.
 */
const SLIDE_DURATION_MS = 170;
const SLIDE_EASING = 'ease';
const SLIDE_SLACK_MS = 50;

export interface SheetPagesProps {
  /** Identity of the page currently in `children`. A change starts a slide. */
  page: string;
  /** Rung of the ladder `page` sits on; the sign of its change is the direction. */
  depth: number;
  className?: string;
  /** The CURRENT page only; the outgoing one is snapshotted here. */
  children: React.ReactNode;
}

interface Stash {
  page: string;
  depth: number;
  children: React.ReactNode;
}

interface Leaving extends Stash {
  direction: 'forward' | 'back';
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia !== 'function' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Navigation inside one surface: the page you leave slides out sideways, the
 * page you arrive at slides in behind it, and the surface's height travels
 * between the two rather than snapping.
 *
 * The consumers all had the same shape already — one either/or that swapped a
 * form for a picker — so `children` stays "the current page" and the outgoing
 * tree is snapshotted here. That is what lets a caller wrap its existing
 * conditional instead of restructuring it into a page registry.
 *
 * Under `prefers-reduced-motion` no second page is ever mounted: the render
 * below swaps synchronously, exactly like the conditional it replaced.
 */
export const SheetPages: React.FC<SheetPagesProps> = ({
  page,
  depth,
  className,
  children,
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const currentSlotRef = React.useRef<HTMLDivElement>(null);
  const leavingSlotRef = React.useRef<HTMLDivElement>(null);
  const idleHeightRef = React.useRef<number | null>(null);

  const [stash, setStash] = React.useState<Stash>({ page, depth, children });
  const [leaving, setLeaving] = React.useState<Leaving | null>(null);

  /* Render-phase `setState` rather than a ref written during render: the app
     runs under StrictMode, whose double render would clobber the ref. */
  if (page !== stash.page) {
    setLeaving(
      prefersReducedMotion()
        ? null // Instant swap: never mount two pages.
        : { ...stash, direction: depth >= stash.depth ? 'forward' : 'back' },
    );
    setStash({ page, depth, children });
  } else if (children !== stash.children || depth !== stash.depth) {
    /* The same page re-rendered: keep the snapshot fresh so a later page
       change captures exactly what was on screen. */
    setStash({ page, depth, children });
  }

  /*
   * Idle bookkeeping. Declared before the driver so that on a settle commit it
   * releases what the animation pinned before anything else measures, and so
   * the height a *future* transition starts from is recorded while the surface
   * is actually at rest.
   *
   * The missing dependency array is deliberate, and the measurement is why.
   * By the time the driver runs, the DOM already holds the incoming page, so
   * the height to animate *away from* cannot be taken there — it has to have
   * been recorded on the commit before. Narrowing this to `[leaving]` would
   * leave a stale height behind whenever the resting page grew, and the height
   * would then jump at the start of the next slide. Reading it during render
   * instead is what `react-hooks/refs` (rightly) forbids.
   */
  React.useLayoutEffect(() => {
    const el = containerRef.current;
    const slotIn = currentSlotRef.current;
    if (leaving || !el) return;

    el.style.transition = '';
    el.style.height = '';
    if (slotIn) {
      slotIn.style.transition = '';
      slotIn.style.transform = '';
    }

    /* The instant path can unmount the focused control. Rescue focus only when
       it actually fell to the body — never steal it from somewhere it
       legitimately went, such as a back button outside this component. */
    if (document.activeElement === document.body && slotIn) {
      slotIn.focus({ preventScroll: true });
    }

    idleHeightRef.current = el.getBoundingClientRect().height;
  });

  React.useLayoutEffect(() => {
    const el = containerRef.current;
    const slotIn = currentSlotRef.current;
    const slotOut = leavingSlotRef.current;
    if (!leaving || !el || !slotIn) return;

    /* 1. Freeze while measuring and pinning. */
    el.style.transition = 'none';
    slotIn.style.transition = 'none';
    if (slotOut) slotOut.style.transition = 'none';

    /* 2. Where the height starts: mid-flight on an interrupt (an inline height
          is still set), otherwise the last resting height. */
    const startH =
      el.style.height !== ''
        ? el.getBoundingClientRect().height
        : (idleHeightRef.current ?? el.getBoundingClientRect().height);

    /* 3. Where it ends: release and let layout answer. Because this container
          is a `min-height: 0` flex child under the sheet's max-height, the
          answer is ALREADY CLAMPED — a too-tall page measures at the space
          available and its own scroller takes the rest. The leaving slot is
          absolutely positioned, so it contributes nothing. */
    el.style.height = '';
    const endH = el.getBoundingClientRect().height;

    /* 3.5 The commit just applied `inert`, which may have force-blurred. */
    const active = document.activeElement;
    if (
      !active ||
      active === document.body ||
      (slotOut?.contains(active) ?? false)
    ) {
      slotIn.focus({ preventScroll: true });
    }

    /* 4. Pin the starting frame. */
    const sign = getComputedStyle(el).direction === 'rtl' ? -1 : 1;
    const enterFrom = (leaving.direction === 'forward' ? 100 : -100) * sign;
    el.style.height = `${startH}px`;
    slotIn.style.transform = `translateX(${enterFrom}%)`;
    if (slotOut) {
      slotOut.style.transform =
        slotOut.style.transform !== ''
          ? /* Interrupted mid-slide: carry on from where it actually is. */
            getComputedStyle(slotOut).transform
          : 'translateX(0%)';
    }

    /* 5. Flush, then animate. A forced synchronous reflow inside a layout
          effect is deterministic and paints nothing intermediate, so no
          double-rAF is needed. */
    void el.offsetHeight;
    const T = `${SLIDE_DURATION_MS}ms ${SLIDE_EASING}`;
    el.style.transition = `height ${T}`;
    slotIn.style.transition = `transform ${T}`;
    if (slotOut) slotOut.style.transition = `transform ${T}`;
    el.style.height = `${endH}px`;
    slotIn.style.transform = 'translateX(0%)';
    if (slotOut) slotOut.style.transform = `translateX(${-enterFrom}%)`;

    /* 6. Whichever lands first. The timeout is not a safety net so much as the
          only path in an environment with no transitions at all. */
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      setLeaving(null);
    };
    const onEnd = (e: TransitionEvent) => {
      /* The incoming transform ALWAYS changes (±100% → 0), unlike the height
         when the two pages happen to be the same size. Filtered so a child's
         own bubbling transition cannot end the slide early. */
      if (e.target === slotIn && e.propertyName === 'transform') settle();
    };
    slotIn.addEventListener('transitionend', onEnd);
    const timer = window.setTimeout(settle, SLIDE_DURATION_MS + SLIDE_SLACK_MS);
    return () => {
      slotIn.removeEventListener('transitionend', onEnd);
      window.clearTimeout(timer);
    };
  }, [leaving]);

  /*
   * Incoming first in document order, and deliberately so — twice over. The
   * keyed diff inserts the new slot without moving the old node, which is what
   * preserves the outgoing page's scroll position; and the incoming page's own
   * `DialogTitle` wins the transient duplicate-id race, so the dialog is named
   * after the destination for the whole slide. Visual order is transform-driven
   * and owes nothing to this.
   */
  return (
    <div
      ref={containerRef}
      className={cn('sheet-pages', leaving && 'is-animating', className)}
    >
      <div
        key={stash.page}
        ref={currentSlotRef}
        className="sheet-pages-slot"
        data-state="current"
        tabIndex={-1}
      >
        {children}
      </div>
      {leaving && (
        <div
          key={leaving.page}
          ref={leavingSlotRef}
          className="sheet-pages-slot"
          data-state="leaving"
          aria-hidden
          inert
        >
          {leaving.children}
        </div>
      )}
    </div>
  );
};

export default SheetPages;
