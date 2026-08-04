import * as React from 'react';
import {
  Signal,
  SignalHigh,
  SignalLow,
  SignalMedium,
  SignalZero,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import './SignalStrength.css';

interface SignalStrengthProps extends Omit<
  React.ComponentProps<'span'>,
  'children'
> {
  lit: number;
  of?: number;
  /** Accessible name, since the glyph alone says nothing to a screen reader. */
  label: string;
}

/**
 * Larger than the drawer's other glyphs on purpose, and matching the battery
 * it sits beside. The ladder is 16 units tall in a 24-unit box, and its lower
 * bars are short strokes that thin out to nothing at the smaller size.
 */
const SIZE = 18;

/**
 * Lucide's ladder, indexed by bars lit. It draws four bars over a baseline
 * dot, so it lands exactly on the four-bar scale every provider reports on.
 */
const SIGNAL_GLYPH = [SignalZero, SignalLow, SignalMedium, SignalHigh, Signal];

const BARS = SIGNAL_GLYPH.length - 1;

/**
 * Link strength as a rising ladder of bars.
 *
 * Two glyphs stacked, because Lucide's are single-tone: the full ladder
 * underneath as a dimmed track, the lit variant over it. Without the track a
 * weak signal is one short stroke floating in space, with nothing to say how
 * short of full it falls — one bar and four bars look equally like "a signal".
 *
 * They align because they are the same drawing. Every variant in the family
 * repeats the same path data for the bars it shares, so the lit bars land on
 * the track's by construction rather than by two numbers being kept in sync.
 */
const SignalStrength = React.forwardRef<HTMLSpanElement, SignalStrengthProps>(
  ({ lit, of = BARS, label, className, ...props }, ref) => {
    /*
     * `of` is whatever the provider counted in, so rescale onto Lucide's four
     * before indexing. A signal reported out of zero bars is not a reading.
     */
    const bars =
      of > 0 ? Math.min(BARS, Math.max(0, Math.round((lit / of) * BARS))) : 0;
    const Glyph = SIGNAL_GLYPH[bars] ?? SignalZero;

    return (
      <span
        className={cn('signal-strength', className)}
        ref={ref}
        role="img"
        aria-label={label}
        {...props}
      >
        <Signal
          className="signal-strength-track"
          size={SIZE}
          aria-hidden="true"
        />
        <Glyph className="signal-strength-lit" size={SIZE} aria-hidden="true" />
      </span>
    );
  },
);

SignalStrength.displayName = 'SignalStrength';

export { SignalStrength, type SignalStrengthProps };
