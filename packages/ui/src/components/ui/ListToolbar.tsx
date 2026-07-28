import * as React from 'react';
import { cn } from '@/lib/utils';
import './ListToolbar.css';

interface ListToolbarProps extends React.ComponentProps<'div'> {
  /** Grows to fill the row — typically a `SearchInput`. */
  search?: React.ReactNode;
}

/**
 * The row of controls that sits above a settings listing: a growing search
 * slot, then any number of fixed-width controls (sort, filter) as children.
 *
 * Deliberately unopinionated about what those controls are, so the next
 * listing that needs one does not fork a second toolbar.
 */
const ListToolbar = React.forwardRef<HTMLDivElement, ListToolbarProps>(
  ({ search, children, className, ...props }, ref) => (
    <div className={cn('list-toolbar', className)} ref={ref} {...props}>
      {search && <div className="list-toolbar-search">{search}</div>}
      {children}
    </div>
  ),
);

ListToolbar.displayName = 'ListToolbar';

export { ListToolbar, type ListToolbarProps };
