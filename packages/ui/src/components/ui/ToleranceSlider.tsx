import * as React from 'react';
import { cn } from '@/lib/utils';
import './Slider.css';
import './ToleranceSlider.css';

interface ToleranceSliderNotch {
  key: string;
  /** Where the notch sits on the track. */
  value: number;
  label: string;
}

interface ToleranceSliderProps extends Omit<
  React.ComponentProps<'div'>,
  'onChange' | 'defaultValue'
> {
  target: number;
  /** The band reaches this far either side of the target. */
  tolerance: number;
  min: number;
  max: number;
  /** How far one drag or arrow-key step moves the target or the tolerance. */
  step: number;
  /** Named points on the track; each label is the button that picks it. */
  notches?: readonly ToleranceSliderNotch[];
  /** The notch the band sits on, shown as picked. */
  activeNotch?: string | null;
  onTargetChange: (target: number) => void;
  onToleranceChange: (tolerance: number) => void;
  /** Picking a notch sets target and tolerance together, so it is the caller's to apply. */
  onNotchSelect?: (key: string) => void;
  /** Accessible names for the target thumb and the two edge cursors. */
  targetLabel: string;
  toleranceLabel: string;
  /** What the values mean, read out in place of the raw numbers. */
  targetValueText?: string;
  toleranceValueText?: string;
}

/** Notches closer than this share of the track would have overlapping labels, so they turn outwards. */
const CROWDED_RATIO = 0.2;

/** A pointer this many px from an edge cursor, and nearer to it than to the thumb, grabs the edge. */
const EDGE_GRAB_PX = 16;

/**
 * How far below the track's middle the notch zone starts. A pick is a whole
 * preset here, not a nearby value, so the zone starts under the thumb's body
 * and a drag that begins on the thumb stays fine.
 */
const NOTCH_ZONE_PX = 12;

type DragPart = 'target' | 'edge';

/**
 * A band on a track: the kit thumb is the target, and the two edge cursors,
 * which move together, are the tolerance either side of it. It wears the
 * Slider's track, thumb and label styles, so the two read as one control.
 *
 * Dragging the thumb along or above the track moves the target in `step`s;
 * dragging over the notch labels lands on notches, as the Slider's detents do.
 */
const ToleranceSlider = React.forwardRef<HTMLDivElement, ToleranceSliderProps>(
  (
    {
      target,
      tolerance,
      min,
      max,
      step,
      notches = [],
      activeNotch = null,
      onTargetChange,
      onToleranceChange,
      onNotchSelect,
      targetLabel,
      toleranceLabel,
      targetValueText,
      toleranceValueText,
      className,
      ...props
    },
    ref,
  ) => {
    const trackRef = React.useRef<HTMLDivElement>(null);
    /* Which part a drag holds, kept in a ref for the reason the Slider keeps
       its drag flag in one: pointer capture is a request, not a guarantee. */
    const draggingRef = React.useRef<DragPart | null>(null);

    const clamp = (value: number) => Math.min(max, Math.max(min, value));
    const ratioOf = (value: number) =>
      max > min ? (clamp(value) - min) / (max - min) : 0;
    const percent = (value: number) => `${ratioOf(value) * 100}%`;
    const snap = (value: number) => Math.round(value / step) * step;

    const lower = target - tolerance;
    const upper = target + tolerance;

    const nearestNotch = (value: number) =>
      notches.reduce<ToleranceSliderNotch | null>((best, notch) => {
        if (best === null) return notch;
        const closer =
          Math.abs(notch.value - value) < Math.abs(best.value - value);
        return closer ? notch : best;
      }, null);

    const pointerOnTrack = (e: React.PointerEvent) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return null;
      const pointerRatio = (e.clientX - rect.left) / rect.width;
      return {
        rect,
        raw: min + pointerRatio * (max - min),
        belowTrack: e.clientY > rect.top + rect.height / 2 + NOTCH_ZONE_PX,
      };
    };

    const applyPointer = (part: DragPart, e: React.PointerEvent) => {
      const pointer = pointerOnTrack(e);
      if (!pointer) return;
      if (part === 'edge') {
        onToleranceChange(snap(Math.abs(pointer.raw - target)));
        return;
      }
      const notch = pointer.belowTrack ? nearestNotch(pointer.raw) : null;
      if (notch && onNotchSelect) {
        if (notch.key !== activeNotch) onNotchSelect(notch.key);
        return;
      }
      const next = clamp(snap(pointer.raw));
      if (next !== target) onTargetChange(next);
    };

    const partUnder = (e: React.PointerEvent): DragPart => {
      const pointer = pointerOnTrack(e);
      if (!pointer || tolerance <= 0) return 'target';
      const xOf = (value: number) =>
        pointer.rect.left + ratioOf(value) * pointer.rect.width;
      const toEdge = Math.min(
        Math.abs(e.clientX - xOf(lower)),
        Math.abs(e.clientX - xOf(upper)),
      );
      const toThumb = Math.abs(e.clientX - xOf(target));
      return toEdge < toThumb && toEdge < EDGE_GRAB_PX ? 'edge' : 'target';
    };

    const handlePointerDown = (e: React.PointerEvent) => {
      const part = partUnder(e);
      draggingRef.current = part;
      try {
        e.currentTarget.setPointerCapture?.(e.pointerId);
      } catch {
        /* Carry on without capture, as the Slider does. */
      }
      applyPointer(part, e);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
      if (draggingRef.current) applyPointer(draggingRef.current, e);
    };

    const endDrag = () => {
      draggingRef.current = null;
    };

    /** The notch after or before the target, for PageUp and PageDown. */
    const notchBeside = (direction: 1 | -1) => {
      const ordered = [...notches].sort((a, b) => a.value - b.value);
      if (direction === 1) return ordered.find((n) => n.value > target);
      return ordered.reverse().find((n) => n.value < target);
    };

    const handleTargetKey = (e: React.KeyboardEvent) => {
      const stepBy = (delta: number) => {
        e.preventDefault();
        const next = clamp(target + delta);
        if (next !== target) onTargetChange(next);
      };
      const jumpTo = (direction: 1 | -1) => {
        e.preventDefault();
        const notch = notchBeside(direction);
        if (notch && onNotchSelect) onNotchSelect(notch.key);
      };
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowUp':
          return stepBy(step);
        case 'ArrowLeft':
        case 'ArrowDown':
          return stepBy(-step);
        case 'PageUp':
          return jumpTo(1);
        case 'PageDown':
          return jumpTo(-1);
        case 'Home':
          return stepBy(min - target);
        case 'End':
          return stepBy(max - target);
        default:
          return undefined;
      }
    };

    /** Arrows move an edge outwards or inwards, so the upper edge widens on the keys the lower one narrows on. */
    const handleEdgeKey = (outwards: 1 | -1) => (e: React.KeyboardEvent) => {
      const forward = e.key === 'ArrowRight' || e.key === 'ArrowUp';
      const backward = e.key === 'ArrowLeft' || e.key === 'ArrowDown';
      if (!forward && !backward) return;
      e.preventDefault();
      const delta = (forward ? step : -step) * outwards;
      onToleranceChange(Math.max(0, tolerance + delta));
    };

    const edge = (value: number, outwards: 1 | -1) => (
      <span
        className="tolerance-slider-edge"
        role="slider"
        tabIndex={0}
        aria-label={toleranceLabel}
        aria-valuemin={0}
        aria-valuenow={tolerance}
        aria-valuetext={toleranceValueText}
        aria-orientation="horizontal"
        onKeyDown={handleEdgeKey(outwards)}
        style={{ left: percent(value) }}
      />
    );

    /** A label hugs its tick at a true end of the track, and turns away from a neighbour that would overlap it. */
    const labelAlignment = (notch: ToleranceSliderNotch) => {
      const ratio = ratioOf(notch.value);
      const crowdedBy = (other: ToleranceSliderNotch) =>
        other.key !== notch.key &&
        Math.abs(ratioOf(other.value) - ratio) < CROWDED_RATIO;
      const neighbourAfter = notches.some(
        (other) => crowdedBy(other) && other.value > notch.value,
      );
      const neighbourBefore = notches.some(
        (other) => crowdedBy(other) && other.value < notch.value,
      );
      if (notch.value === min || (neighbourBefore && !neighbourAfter)) {
        return 'at-start';
      }
      if (notch.value === max || (neighbourAfter && !neighbourBefore)) {
        return 'at-end';
      }
      return undefined;
    };

    return (
      <div
        className={cn('slider', 'tolerance-slider', className)}
        ref={ref}
        /* As on the Slider: inside a phone sheet the vertical half of the
           gesture is the notch zone, which the drawer must not read as a drag. */
        data-vaul-no-drag=""
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        {...props}
      >
        <div className="slider-track" ref={trackRef}>
          <span
            className="slider-fill"
            style={{
              left: percent(lower),
              width: `calc(${percent(upper)} - ${percent(lower)})`,
            }}
          />
          {tolerance > 0 && edge(lower, -1)}
          {tolerance > 0 && edge(upper, 1)}
          <span
            className="slider-thumb tolerance-slider-thumb"
            role="slider"
            tabIndex={0}
            aria-label={targetLabel}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={clamp(target)}
            aria-valuetext={targetValueText}
            aria-orientation="horizontal"
            onKeyDown={handleTargetKey}
            style={{ left: percent(target) }}
          />
        </div>
        {notches.length > 0 && (
          <div className="slider-ticks">
            {notches.map((notch) => (
              <span
                key={notch.key}
                className="slider-tick labeled"
                aria-hidden="true"
                style={{ left: percent(notch.value) }}
              />
            ))}
            {notches.map((notch) => (
              <button
                key={notch.key}
                type="button"
                className={cn(
                  'slider-label',
                  'tolerance-slider-notch',
                  labelAlignment(notch),
                  notch.key === activeNotch && 'active',
                )}
                aria-pressed={notch.key === activeNotch}
                style={{ left: percent(notch.value) }}
                /* A press on a label picks its notch; it must not also start
                   a drag on the track underneath. */
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onNotchSelect?.(notch.key)}
              >
                {notch.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  },
);

ToleranceSlider.displayName = 'ToleranceSlider';

export {
  ToleranceSlider,
  type ToleranceSliderProps,
  type ToleranceSliderNotch,
};
