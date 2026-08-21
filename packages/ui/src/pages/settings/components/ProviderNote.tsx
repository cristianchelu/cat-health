import * as React from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import './ProviderNote.css';

type ProviderNoteVariant = 'info' | 'warn';

interface ProviderNoteProps extends React.ComponentProps<'p'> {
  variant?: ProviderNoteVariant;
}

/**
 * A note about a provider: what its account can and cannot do, or what we are
 * relying on that its vendor never promised.
 *
 * Deliberately not `Callout`, which is the band a form puts an error in — flat
 * tint, no icon, `role="alert"` when it matters. This is standing context on a
 * settings page, and the icon carries most of the difference between "worth
 * knowing" and "be careful": the variant picks it, so five call sites stop
 * repeating the same ternary.
 */
const ProviderNote: React.FC<ProviderNoteProps> = ({
  variant = 'info',
  className,
  children,
  ...props
}) => (
  <p className={cn('provider-note', variant, className)} {...props}>
    {variant === 'warn' ? (
      <AlertTriangle size={18} aria-hidden="true" />
    ) : (
      <Info size={18} aria-hidden="true" />
    )}
    <span>{children}</span>
  </p>
);

export { ProviderNote, type ProviderNoteProps, type ProviderNoteVariant };
