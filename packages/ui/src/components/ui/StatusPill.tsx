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
const StatusPill: React.FC<StatusPillProps> = ({
  variant = 'neutral',
  dot = false,
  className,
  children,
  ...props
}) => (
  <span className={cn('status-pill', variant, className)} {...props}>
    {dot && <span className="status-pill-dot" aria-hidden="true" />}
    {children}
  </span>
);

export { StatusPill, type StatusPillProps, type StatusPillVariant };
