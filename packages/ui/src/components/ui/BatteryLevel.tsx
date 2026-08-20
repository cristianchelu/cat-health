import * as React from 'react';
import { Battery, BatteryFull, BatteryLow, BatteryMedium } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MeterTone } from './Meter';
import './BatteryLevel.css';

interface BatteryLevelProps extends Omit<
  React.ComponentProps<'span'>,
  'children'
> {
  /** Charge remaining, 0 to 100. */
  percent: number;
  tone?: MeterTone;
  label: string;
}

/**
 * Larger than the drawer's other glyphs on purpose. Lucide draws the battery
 * 12 units tall in a 24-unit box — half the height of a clock or a triangle —
 * so matching their nominal size would leave it visibly the lighter mark.
 * This is the size at which it reads as their equal.
 */
const SIZE = 18;

/**
 * Lucide draws the shell with nought to three cells inside it, so charge
 * quantises to quarters — nearest cell, not floor. A battery at 24% rendering
 * as an empty shell would alarm harder than its tone says it should.
 */
const BATTERY_GLYPH = [Battery, BatteryLow, BatteryMedium, BatteryFull];

/**
 * Charge remaining.
 *
 * The glyph says how full and the tone says how urgent. Keeping those on
 * separate axes means a battery that is merely low still looks low without
 * looking like something you have to act on.
 */
const BatteryLevel = React.forwardRef<HTMLSpanElement, BatteryLevelProps>(
  ({ percent, tone = 'calm', label, className, ...props }, ref) => {
    const clamped = Math.min(100, Math.max(0, percent));
    const Glyph = BATTERY_GLYPH[Math.round((clamped / 100) * 3)] ?? Battery;

    return (
      <span
        className={cn('battery-level', 'tone', tone, className)}
        ref={ref}
        role="img"
        aria-label={label}
        {...props}
      >
        <Glyph size={SIZE} aria-hidden="true" />
      </span>
    );
  },
);

BatteryLevel.displayName = 'BatteryLevel';

export { BatteryLevel, type BatteryLevelProps };
