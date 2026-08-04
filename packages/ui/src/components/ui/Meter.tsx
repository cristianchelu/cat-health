import * as React from 'react';
import { cn } from '@/lib/utils';
import './Meter.css';

type MeterTone = 'calm' | 'soon' | 'now' | 'stale';

interface MeterProps extends Omit<React.ComponentProps<'div'>, 'children'> {
  /** Fill fraction, 0 to 1. Values outside the range are clamped. */
  value: number;
  tone?: MeterTone;
  /** `md` is a gauge in its own right; `sm` is the inline bar on a meta line. */
  size?: 'md' | 'sm';
  /** Accessible name. Omit only when a visible label already names the meter. */
  label?: string;
  /** What the fill represents, read out in place of the raw fraction. */
  valueText?: string;
}

/**
 * A level as a proportion of its whole.
 *
 * An empty track is a meaningful state, not a missing one: a device that cannot
 * report renders the track with no fill, which reads as loudly as a red bar.
 */
const Meter = React.forwardRef<HTMLDivElement, MeterProps>(
  (
    {
      value,
      tone = 'calm',
      size = 'md',
      label,
      valueText,
      className,
      ...props
    },
    ref,
  ) => {
    const fill = Math.min(1, Math.max(0, value));

    return (
      <div
        className={cn('meter', 'tone', tone, size, className)}
        ref={ref}
        role="meter"
        aria-valuenow={Math.round(fill * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={valueText}
        aria-label={label}
        {...props}
      >
        <span className="meter-fill" style={{ width: `${fill * 100}%` }} />
      </div>
    );
  },
);

Meter.displayName = 'Meter';

export { Meter, type MeterProps, type MeterTone };
