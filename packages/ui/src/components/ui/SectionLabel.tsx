import * as React from 'react';
import { cn } from '@/lib/utils';
import './SectionLabel.css';

interface SectionLabelProps extends React.ComponentProps<'div'> {
  /**
   * A quiet note on the trailing edge of the same line — how many samples the
   * band below holds, what window it was smoothed over.
   */
  aside?: React.ReactNode;
}

/**
 * The name of a group, above it.
 *
 * The same landmark the pickers, the menus and the food ladder already draw;
 * `SectionLabel.css` is the one place its type is written, and a host that
 * renders its own element (a Radix label, a sticky header) wears the
 * `section-label` class instead of this component.
 *
 * Not `SectionHeader`, which is a heading proper — an `h2` with a subtitle and
 * room for actions. This is an eyebrow: it names what follows and takes no
 * space arguing about it.
 */
const SectionLabel = React.forwardRef<HTMLDivElement, SectionLabelProps>(
  ({ aside, className, children, ...props }, ref) => (
    <div className={cn('section-label', className)} ref={ref} {...props}>
      <span>{children}</span>
      {aside != null && <span className="section-label-aside">{aside}</span>}
    </div>
  ),
);

SectionLabel.displayName = 'SectionLabel';

export { SectionLabel, type SectionLabelProps };
