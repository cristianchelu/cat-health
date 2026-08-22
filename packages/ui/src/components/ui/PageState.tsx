import * as React from 'react';
import { Spinner } from './Spinner';
import { cn } from '@/lib/utils';
import './PageState.css';

interface LoadingStateProps extends React.ComponentProps<'div'> {
  message?: string;
}

const LoadingState = React.forwardRef<HTMLDivElement, LoadingStateProps>(
  ({ className, message, children, ...props }, ref) => {
    return (
      <div
        className={cn('page-state', 'loading-state', className)}
        ref={ref}
        role="status"
        aria-live="polite"
        {...props}
      >
        {children ?? (
          <>
            <Spinner />
            {message}
          </>
        )}
      </div>
    );
  },
);

LoadingState.displayName = 'LoadingState';

interface EmptyStateProps extends React.ComponentProps<'div'> {
  message?: string;
  /**
   * `error` for a surface that failed to load rather than one with nothing in
   * it. Both are empty; only one is the user's problem.
   */
  tone?: 'muted' | 'error';
}

const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ className, message, tone = 'muted', children, ...props }, ref) => {
    return (
      <div
        className={cn('page-state', 'empty-state', tone, className)}
        ref={ref}
        role={tone === 'error' ? 'alert' : undefined}
        {...props}
      >
        {children ?? message}
      </div>
    );
  },
);

EmptyState.displayName = 'EmptyState';

export {
  LoadingState,
  EmptyState,
  type LoadingStateProps,
  type EmptyStateProps,
};
