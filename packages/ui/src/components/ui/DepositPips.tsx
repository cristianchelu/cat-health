import * as React from 'react';
import type { SignalPipTone } from 'shared';
import { cn } from '@/lib/utils';
import './DepositPips.css';

interface DepositPipsProps extends Omit<
  React.ComponentProps<'div'>,
  'children'
> {
  /** Deposits in the order they happened, oldest first. */
  pips: readonly SignalPipTone[];
  /** How many deposits the server will send before it drops the oldest. */
  of: number;
  label?: string;
  valueText?: string;
}

/**
 * Discrete deposits in a litterbox, coloured by what was left.
 *
 * A count, not a level: the box fills one visit at a time, so a bar would
 * smooth over the thing being counted.
 *
 * A count has no empty half, so nothing is drawn behind it. The row once ran
 * out to a fixed eight slots, which drew a capacity the box does not have —
 * eight is where the server stops sending, not where the litter runs out —
 * and stopped short of the card's edge besides. Filling the row instead would
 * mean fitting the slots to the card width, and CSS can repeat a painted
 * track or lay out elements on a fixed pitch but cannot do both in register,
 * so the track goes rather than arrive clipped or misaligned.
 */
const DepositPips = React.forwardRef<HTMLDivElement, DepositPipsProps>(
  ({ pips, of, label, valueText, className, ...props }, ref) => (
    <div
      className={cn('deposit-pips', className)}
      ref={ref}
      role="meter"
      aria-valuenow={pips.length}
      aria-valuemin={0}
      aria-valuemax={of}
      aria-valuetext={valueText}
      aria-label={label}
      {...props}
    >
      {pips.map((pip, index) => (
        <span key={index} className={cn('pip', pip)} aria-hidden="true" />
      ))}
    </div>
  ),
);

DepositPips.displayName = 'DepositPips';

export { DepositPips, type DepositPipsProps };
