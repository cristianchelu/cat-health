import * as React from 'react';
import { cn } from '@/lib/utils';
import type { MeterTone } from './Meter';
import './SegmentMeter.css';

interface SegmentMeterProps
  extends Omit<React.ComponentProps<'div'>, 'children'> {
  lit: number;
  of: number;
  /**
   * Relative width per segment, as the signal declared it. Omit for a scale
   * whose steps are even shares of what it measures.
   */
  weights?: readonly number[];
  tone?: MeterTone;
  label?: string;
  valueText?: string;
}

/**
 * A level a sensor can only report in steps, such as a beam-sensor hopper that
 * distinguishes full, low and empty and nothing between.
 *
 * Every lit segment carries the same tone. The count is the reading; shading
 * them individually would imply a precision the sensor does not have.
 *
 * Segments are even unless the signal weighted them, because where a sensor's
 * steps fall is a property of that sensor and not of how many there are.
 */
const SegmentMeter = React.forwardRef<HTMLDivElement, SegmentMeterProps>(
  (
    { lit, of, weights, tone = 'calm', label, valueText, className, ...props },
    ref,
  ) => (
    <div
      className={cn('segment-meter', 'tone', tone, className)}
      ref={ref}
      role="meter"
      aria-valuenow={lit}
      aria-valuemin={0}
      aria-valuemax={of}
      aria-valuetext={valueText}
      aria-label={label}
      {...props}
    >
      {Array.from({ length: of }, (_, index) => (
        <span
          key={index}
          className={cn('segment', index < lit && 'lit')}
          style={weights ? { flex: weights[index] ?? 1 } : undefined}
          aria-hidden="true"
        />
      ))}
    </div>
  ),
);

SegmentMeter.displayName = 'SegmentMeter';

export { SegmentMeter, type SegmentMeterProps };
