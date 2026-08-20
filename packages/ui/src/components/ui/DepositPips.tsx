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
  /** Track length. Slots past the end of `pips` render empty. */
  of: number;
  label?: string;
  valueText?: string;
}

/**
 * Discrete deposits in a litterbox, coloured by what was left.
 *
 * A count, not a level: the box fills one visit at a time, so a bar would
 * smooth over the thing being counted.
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
      {Array.from({ length: of }, (_, index) => (
        <span
          key={index}
          className={cn('pip', pips[index])}
          aria-hidden="true"
        />
      ))}
    </div>
  ),
);

DepositPips.displayName = 'DepositPips';

export { DepositPips, type DepositPipsProps };
