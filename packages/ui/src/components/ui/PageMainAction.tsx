import * as React from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router';
import { Plus, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFabScrollAway } from '@/hooks/useFabScrollAway';
import './PageMainAction.css';

/** The shell's mount point for the mobile FAB — see `PageMainActionFabSlot`. */
const FAB_SLOT_ID = 'page-main-action-fab-slot';

interface PageMainActionProps {
  /** Where the action goes. Give this or `onClick`, not both. */
  to?: string;
  /** Run the action in place — a modal, a drawer. Give this or `to`. */
  onClick?: () => void;
  /** Button text on desktop, and the accessible name of the mobile FAB. */
  label: string;
  /**
   * The mark, as a component so each half can size it — the header button and
   * the FAB draw the same icon at very different sizes. Defaults to a plus
   * because most pages lead with adding; name the action instead when the page
   * does something else with it.
   */
  icon?: LucideIcon;
  className?: string;
}

/**
 * The one thing a page is for — usually adding, not always — in two mutually
 * exclusive halves: `PageMainAction` sits in the header's actions on desktop,
 * `PageMainActionFab` is a thumb-reachable floating button on mobile.
 *
 * One per page. A page with two of these has no main action, and the FAB half
 * has nowhere to put the second one anyway.
 *
 * They live in one module because they are a pair — exactly one is visible at
 * any width, and splitting them across files is how they drift into being
 * visible together. Both are needed because they mount at different points in
 * the tree, so a single wrapper element can't own both. The FAB half mounts
 * through `PageMainActionFabSlot`, which the app shell renders once.
 *
 * Either half is a link or a button depending on what it does: navigating to
 * another page is a link, opening a modal in place is a button. That is not a
 * styling choice — middle-click, copy-link and "open in new tab" all have to
 * work on the first and mean nothing on the second.
 */
const PageMainAction = React.forwardRef<
  HTMLAnchorElement | HTMLButtonElement,
  PageMainActionProps
>(({ to, onClick, label, icon: Icon = Plus, className }, ref) => {
  const classes = cn(
    'button',
    'primary',
    'md',
    'page-main-action-link',
    className,
  );
  const content = (
    <>
      <Icon size="1em" aria-hidden="true" />
      {label}
    </>
  );

  return to !== undefined ? (
    <Link ref={ref as React.Ref<HTMLAnchorElement>} to={to} className={classes}>
      {content}
    </Link>
  ) : (
    <button
      ref={ref as React.Ref<HTMLButtonElement>}
      type="button"
      onClick={onClick}
      className={classes}
    >
      {content}
    </button>
  );
});

PageMainAction.displayName = 'PageMainAction';

/**
 * The FAB's mount point, rendered once by the app shell between the scrolling
 * `main` and `MobileNav`.
 *
 * A page still declares its own `PageMainActionFab`; the button portals up here
 * so it is an overlay rather than page content. In the page it was neither: it
 * took flow space at the end of the scroll (dead room under the last card) and,
 * on a page too short to scroll, `position: sticky` had nothing to stick to and
 * left it stranded mid-screen. A zero-height layer at the shell's content/nav
 * seam pins it above the nav at any content length, with no nav-sized offset to
 * keep in sync.
 *
 * Owning the layer is also what lets the shell take the FAB out of the way on
 * the way down the page (`useFabScrollAway`) without any page knowing.
 */
const PageMainActionFabSlot: React.FC = () => {
  const ref = React.useRef<HTMLDivElement>(null);
  useFabScrollAway(ref, useLocation().pathname);

  return <div ref={ref} id={FAB_SLOT_ID} />;
};

const PageMainActionFab = React.forwardRef<
  HTMLAnchorElement | HTMLButtonElement,
  PageMainActionProps
>(({ to, onClick, label, icon: Icon = Plus, className }, ref) => {
  /*
   * Resolved after mount because the slot is an ancestor: on the first render
   * of the app no DOM exists yet. A layout effect re-renders before paint, so
   * the FAB is never a frame late. Without a slot — a page rendered outside the
   * shell, as tests do — it stays where the page put it.
   */
  const [slot, setSlot] = React.useState<HTMLElement | null>(null);
  React.useLayoutEffect(() => {
    setSlot(document.getElementById(FAB_SLOT_ID));
  }, []);

  const classes = cn('page-main-action-fab', className);
  const mark = <Icon size={24} aria-hidden="true" />;

  const fab =
    to !== undefined ? (
      <Link
        ref={ref as React.Ref<HTMLAnchorElement>}
        to={to}
        className={classes}
        aria-label={label}
      >
        {mark}
      </Link>
    ) : (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        type="button"
        onClick={onClick}
        className={classes}
        aria-label={label}
      >
        {mark}
      </button>
    );

  return slot ? createPortal(fab, slot) : fab;
});

PageMainActionFab.displayName = 'PageMainActionFab';

export {
  PageMainAction,
  PageMainActionFab,
  PageMainActionFabSlot,
  type PageMainActionProps,
};
