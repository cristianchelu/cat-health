import * as React from 'react';
import { cn } from '@/lib/utils';
import './AttentionIcon.css';

interface AttentionIconProps extends Omit<
  React.ComponentProps<'svg'>,
  'children'
> {
  /** `soon` is amber and means act before long; `now` is red and means act. */
  tone: 'soon' | 'now';
  label: string;
}

/**
 * A filled warning triangle, icon only.
 *
 * No pill and no wording: it sits at the end of a header row that a long
 * product name is already competing for, and severity is carried by colour.
 */
const AttentionIcon = React.forwardRef<SVGSVGElement, AttentionIconProps>(
  ({ tone, label, className, ...props }, ref) => (
    <svg
      className={cn('attention-icon', tone, className)}
      ref={ref}
      viewBox="0 0 24 24"
      role="img"
      aria-label={label}
      {...props}
    >
      <path
        fill="currentColor"
        d="M13.7 3.3a2 2 0 0 0-3.4 0L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3z"
      />
      <path
        className="attention-icon-mark"
        d="M12 9.5v4M12 16.9h.01"
        fill="none"
        strokeWidth={2}
        strokeLinecap="round"
      />
    </svg>
  ),
);

AttentionIcon.displayName = 'AttentionIcon';

export { AttentionIcon, type AttentionIconProps };
