import * as React from 'react';
import { cn } from '@/lib/utils';
import type { MeterTone } from './Meter';
import './SegmentMeter.css';

interface SegmentMeterProps
  extends Omit<React.ComponentProps<'div'>, 'children'> {
  lit: number;
  of: number;
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
 */
const SegmentMeter = React.forwardRef<HTMLDivElement, SegmentMeterProps>(
  ({ lit, of, tone = 'calm', label, valueText, className, ...props }, ref) => (
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
          aria-hidden="true"
        />
      ))}
    </div>
  ),
);

SegmentMeter.displayName = 'SegmentMeter';

export { SegmentMeter, type SegmentMeterProps };
