import * as React from 'react';
import { Link } from 'react-router';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import './PageAddAction.css';

interface PageAddActionProps {
  /** Where the add flow starts. */
  to: string;
  /** Button text on desktop, and the accessible name of the mobile FAB. */
  label: string;
  className?: string;
}

/**
 * The add affordance for a settings list page, in two mutually exclusive
 * halves: `PageAddLink` sits in the SectionHeader's actions on desktop,
 * `PageAddFab` is a thumb-reachable floating button on mobile.
 *
 * They live in one module because they are a pair — exactly one is visible at
 * any width, and splitting them across files is how they drift into being
 * visible together. Both are needed because they mount at different points in
 * the tree, so a single wrapper element can't own both.
 */
const PageAddLink = React.forwardRef<HTMLAnchorElement, PageAddActionProps>(
  ({ to, label, className }, ref) => (
    <Link
      ref={ref}
      to={to}
      className={cn('button', 'primary', 'md', 'page-add-link', className)}
    >
      <Plus size="1em" />
      {label}
    </Link>
  ),
);

PageAddLink.displayName = 'PageAddLink';

const PageAddFab = React.forwardRef<HTMLAnchorElement, PageAddActionProps>(
  ({ to, label, className }, ref) => (
    <Link
      ref={ref}
      to={to}
      className={cn('page-add-fab', className)}
      aria-label={label}
    >
      <Plus size={24} aria-hidden="true" />
    </Link>
  ),
);

PageAddFab.displayName = 'PageAddFab';

export { PageAddLink, PageAddFab, type PageAddActionProps };
