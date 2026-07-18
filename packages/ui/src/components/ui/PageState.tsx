import * as React from 'react';
import { Loader2 } from 'lucide-react';
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
            <Loader2 className="animate-spin" size="1em" aria-hidden />
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
}

const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ className, message, children, ...props }, ref) => {
    return (
      <div
        className={cn('page-state', 'empty-state', className)}
        ref={ref}
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
