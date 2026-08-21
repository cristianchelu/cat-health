import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import './Spinner.css';

interface SpinnerProps extends React.ComponentProps<typeof Loader2> {
  /**
   * Defaults to `1em`, so a spinner beside a label is the size of that label
   * without anyone having to say so. Pass a number where it stands alone.
   */
  size?: number | string;
}

/**
 * The app's one spinner: a mark that turns while something is in flight.
 *
 * Always `aria-hidden`. A spinner says nothing a screen reader can use — what
 * is loading is said by the thing around it (`PageState`'s `role="status"`,
 * a button's label), and a second announcement of "image" would only get in
 * the way of that one.
 *
 * It exists because the turning did not travel with the icon: four stylesheets
 * had each defined the animation under their own root, so a `Loader2` only
 * turned in the three places whose stylesheet happened to be an ancestor, and
 * stood still in five others.
 */
const Spinner = React.forwardRef<SVGSVGElement, SpinnerProps>(
  ({ size = '1em', className, ...props }, ref) => (
    <Loader2
      ref={ref}
      size={size}
      aria-hidden="true"
      className={cn('spinner', className)}
      {...props}
    />
  ),
);

Spinner.displayName = 'Spinner';

export { Spinner, type SpinnerProps };
