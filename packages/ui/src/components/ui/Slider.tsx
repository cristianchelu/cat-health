import * as React from 'react';
import { cn } from '@/lib/utils';
import { detentAfter, detentBefore, nearestDetent } from '@/lib/sliderDetents';
import './Slider.css';

interface SliderProps extends Omit<
  React.ComponentProps<'div'>,
  'onChange' | 'defaultValue'
> {
  value: number;
  min: number;
  max: number;
  /** The fine granularity: keyboard arrows and above-track drags move by this. */
  step: number;
  /**
   * Coarse snap points, sorted ascending. Rendered as ticks; dragging below
   * the track and PageUp/PageDown land on these.
   */
  detents?: readonly number[];
  /** Labels rendered under matching detents ("¼", "1 pouch"). */
  detentLabels?: ReadonlyMap<number, string>;
  onValueChange: (value: number) => void;
  /** Accessible name. */
  label: string;
  /** What the value means, read out in place of the raw number ("40 g ≈ 36 kcal"). */
  valueText?: string;
  disabled?: boolean;
}

/**
 * A slider with two drag granularities in one gesture: along or above the
 * track the pointer moves in `step` increments, below the track it snaps
 * detent-to-detent — coarse and fine with no mode switch. Keyboard mirrors
 * the split: arrows move by `step`, PageUp/PageDown by detent.
 */
const Slider = React.forwardRef<HTMLDivElement, SliderProps>(
  (
    {
      value,
      min,
      max,
      step,
      detents,
      detentLabels,
      onValueChange,
      label,
      valueText,
      disabled = false,
      className,
      ...props
    },
    ref,
  ) => {
    const trackRef = React.useRef<HTMLDivElement>(null);
    /* Drag state lives here rather than in `hasPointerCapture`: capture is a
       request, not a guarantee, and a move that arrives without it would
       otherwise be dropped mid-gesture. */
    const draggingRef = React.useRef(false);

    const clamp = (raw: number) => Math.min(max, Math.max(min, raw));
    const ratio = max > min ? (clamp(value) - min) / (max - min) : 0;

    const valueFromPointer = (e: React.PointerEvent) => {
      const track = trackRef.current;
      if (!track) return null;
      const rect = track.getBoundingClientRect();
      if (rect.width === 0) return null;
      const pointerRatio = Math.min(
        1,
        Math.max(0, (e.clientX - rect.left) / rect.width),
      );
      const raw = min + pointerRatio * (max - min);
      const coarse =
        detents !== undefined &&
        detents.length > 0 &&
        e.clientY > rect.top + rect.height / 2;
      const next = coarse
        ? nearestDetent(detents, raw)
        : Math.round(raw / step) * step;
      return clamp(next);
    };

    const handlePointer = (e: React.PointerEvent) => {
      if (disabled) return;
      const next = valueFromPointer(e);
      if (next != null && next !== value) onValueChange(next);
    };

    const handlePointerDown = (e: React.PointerEvent) => {
      if (disabled) return;
      draggingRef.current = true;
      try {
        /* Capture keeps a drag alive past the element's edges, but it throws
           if the pointer is already gone — which must not cost us the move
           that is being handled right now. */
        e.currentTarget.setPointerCapture?.(e.pointerId);
      } catch {
        /* Carry on without capture. */
      }
      handlePointer(e);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      handlePointer(e);
    };

    const endDrag = () => {
      draggingRef.current = false;
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (disabled) return;
      let next: number | null = null;
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowUp':
          next = clamp(value + step);
          break;
        case 'ArrowLeft':
        case 'ArrowDown':
          next = clamp(value - step);
          break;
        case 'PageUp':
          next =
            detents && detents.length > 0
              ? (detentAfter(detents, value) ?? clamp(value + step))
              : clamp(value + step * 10);
          break;
        case 'PageDown':
          next =
            detents && detents.length > 0
              ? (detentBefore(detents, value) ?? clamp(value - step))
              : clamp(value - step * 10);
          break;
        case 'Home':
          next = min;
          break;
        case 'End':
          next = max;
          break;
        default:
          return;
      }
      e.preventDefault();
      if (next !== value) onValueChange(next);
    };

    const tickRatio = (detent: number) =>
      max > min ? (detent - min) / (max - min) : 0;

    const labeledDetents =
      detentLabels && detents
        ? detents.filter((detent) => detentLabels.has(detent))
        : [];

    return (
      <div
        className={cn('slider', disabled && 'disabled', className)}
        ref={ref}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        {...props}
      >
        <div className="slider-track" ref={trackRef}>
          <span className="slider-fill" style={{ width: `${ratio * 100}%` }} />
          <span
            className="slider-thumb"
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-label={label}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={clamp(value)}
            aria-valuetext={valueText}
            aria-orientation="horizontal"
            aria-disabled={disabled || undefined}
            onKeyDown={handleKeyDown}
            style={{ left: `${ratio * 100}%` }}
          />
        </div>
        {/* Notches live under the bar rather than across it: a mark cutting
            through the fill reads as part of the value, not as a landmark. */}
        {detents !== undefined && detents.length > 0 && (
          <div className="slider-ticks" aria-hidden="true">
            {detents.map((detent) => (
              <span
                key={detent}
                className={cn(
                  'slider-tick',
                  detentLabels?.has(detent) && 'labeled',
                )}
                style={{ left: `${tickRatio(detent) * 100}%` }}
              />
            ))}
            {labeledDetents.map((detent, index) => (
              <span
                key={detent}
                className={cn(
                  'slider-label',
                  index === 0 && 'at-start',
                  index === labeledDetents.length - 1 && 'at-end',
                )}
                style={{ left: `${tickRatio(detent) * 100}%` }}
              >
                {detentLabels?.get(detent)}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  },
);

Slider.displayName = 'Slider';

export { Slider, type SliderProps };
