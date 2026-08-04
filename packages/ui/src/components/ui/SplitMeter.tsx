import * as React from 'react';
import { cn } from '@/lib/utils';
import { Meter, type MeterTone } from './Meter';
import './SplitMeter.css';

interface SplitMeterCell {
  label: string;
  value: React.ReactNode;
  /** Fill fraction, 0 to 1. */
  fill: number;
  tone?: MeterTone;
}

interface SplitMeterProps
  extends Omit<React.ComponentProps<'div'>, 'children'> {
  cells: readonly [SplitMeterCell, SplitMeterCell];
}

/**
 * Two labelled meters sharing one slot, for hardware that weighs two bowls
 * independently. They answer the same question about one device, so they take
 * one slot between them rather than one each.
 */
const SplitMeter = React.forwardRef<HTMLDivElement, SplitMeterProps>(
  ({ cells, className, ...props }, ref) => (
    <div className={cn('split-meter', className)} ref={ref} {...props}>
      {cells.map((cell, index) => (
        <div className="split-meter-cell" key={index}>
          <div className="split-meter-head">
            <span className="split-meter-label">{cell.label}</span>
            <span className={cn('split-meter-value', 'tone', cell.tone)}>
              {cell.value}
            </span>
          </div>
          <Meter value={cell.fill} tone={cell.tone} label={cell.label} />
        </div>
      ))}
    </div>
  ),
);

SplitMeter.displayName = 'SplitMeter';

export { SplitMeter, type SplitMeterProps, type SplitMeterCell };
