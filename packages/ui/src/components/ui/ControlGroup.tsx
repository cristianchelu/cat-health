import * as React from 'react';
import { cn } from '@/lib/utils';
import './ControlGroup.css';

type ControlGroupProps = React.ComponentProps<'div'>;

/**
 * Fuses adjacent form controls into one segmented widget: the inner corners go
 * square, the touching borders collapse into a single line.
 *
 * Knows nothing about what it holds — a select and a button, two buttons, an
 * input and a button — so the next widget that needs the segmented look does not
 * fork its own CSS for it.
 *
 * Each segment keeps its own accessible name; this is a visual container, not a
 * control. Pass `role="group"` with a label if the grouping itself needs saying.
 */
const ControlGroup = React.forwardRef<HTMLDivElement, ControlGroupProps>(
  ({ className, children, ...props }, ref) => (
    <div className={cn('control-group', className)} ref={ref} {...props}>
      {children}
    </div>
  ),
);

ControlGroup.displayName = 'ControlGroup';

export { ControlGroup, type ControlGroupProps };
