import * as React from 'react';
import { cn } from '@/lib/utils';
import './Callout.css';

type CalloutTone = 'error' | 'warning' | 'info';

interface CalloutProps extends React.ComponentProps<'div'> {
  tone?: CalloutTone;
  /** Convenience for the common case of a single string. */
  message?: string | null;
}

/**
 * A tinted band saying something went wrong, or is about to.
 *
 * Renders nothing without content, so a caller can hand it a nullable error
 * and stop writing the guard.
 *
 * Only `error` announces itself. A warning or a note that interrupts a screen
 * reader mid-task costs more than it tells.
 */
const Callout = React.forwardRef<HTMLDivElement, CalloutProps>(
  ({ tone = 'error', message, className, children, ...props }, ref) => {
    const content = message ?? children;
    if (!content) return null;

    return (
      <div
        className={cn('callout', tone, className)}
        ref={ref}
        role={tone === 'error' ? 'alert' : undefined}
        {...props}
      >
        {content}
      </div>
    );
  },
);

Callout.displayName = 'Callout';

export { Callout, type CalloutProps, type CalloutTone };
