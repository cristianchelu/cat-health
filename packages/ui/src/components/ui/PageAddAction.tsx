import * as React from 'react';
import { Link } from 'react-router';
import { Plus, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import './PageAddAction.css';

interface PageAddActionProps {
  /** Where the add flow starts. Give this or `onClick`, not both. */
  to?: string;
  /** Run the add flow in place — a modal, a drawer. Give this or `to`. */
  onClick?: () => void;
  /** Button text on desktop, and the accessible name of the mobile FAB. */
  label: string;
  /**
   * The mark, as a component so each half can size it — the header button and
   * the FAB draw the same icon at very different sizes. Defaults to a plus;
   * name the thing being added instead when the page adds one specific thing.
   */
  icon?: LucideIcon;
  className?: string;
}

/**
 * The add affordance for a page, in two mutually exclusive halves:
 * `PageAddAction` sits in the header's actions on desktop, `PageAddFab` is a
 * thumb-reachable floating button on mobile.
 *
 * They live in one module because they are a pair — exactly one is visible at
 * any width, and splitting them across files is how they drift into being
 * visible together. Both are needed because they mount at different points in
 * the tree, so a single wrapper element can't own both.
 *
 * Either half is a link or a button depending on what it does: navigating to an
 * add page is a link, opening a modal in place is a button. That is not a
 * styling choice — middle-click, copy-link and "open in new tab" all have to
 * work on the first and mean nothing on the second.
 */
const PageAddAction = React.forwardRef<
  HTMLAnchorElement | HTMLButtonElement,
  PageAddActionProps
>(({ to, onClick, label, icon: Icon = Plus, className }, ref) => {
  const classes = cn('button', 'primary', 'md', 'page-add-link', className);
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

PageAddAction.displayName = 'PageAddAction';

const PageAddFab = React.forwardRef<
  HTMLAnchorElement | HTMLButtonElement,
  PageAddActionProps
>(({ to, onClick, label, icon: Icon = Plus, className }, ref) => {
  const classes = cn('page-add-fab', className);
  const mark = <Icon size={24} aria-hidden="true" />;

  return to !== undefined ? (
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
});

PageAddFab.displayName = 'PageAddFab';

export { PageAddAction, PageAddFab, type PageAddActionProps };
