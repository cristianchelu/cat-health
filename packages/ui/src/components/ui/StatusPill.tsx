import * as React from 'react';
import { cn } from '@/lib/utils';
import './StatusPill.css';

type StatusPillVariant = 'ok' | 'warn' | 'error' | 'off' | 'neutral';

interface StatusPillProps extends React.ComponentProps<'span'> {
  variant?: StatusPillVariant;
  /** Show a leading status dot. */
  dot?: boolean;
}

/** Small rounded status label. Provider-agnostic — the caller picks the variant. */
const StatusPill = React.forwardRef<HTMLSpanElement, StatusPillProps>(
  ({ variant = 'neutral', dot = false, className, children, ...props }, ref) => (
    <span
      className={cn('status-pill', variant, className)}
      ref={ref}
      {...props}
    >
      {dot && <span className="status-pill-dot" aria-hidden="true" />}
      {children}
    </span>
  ),
);

StatusPill.displayName = 'StatusPill';

export { StatusPill, type StatusPillProps, type StatusPillVariant };
