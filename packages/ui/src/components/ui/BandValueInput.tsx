import * as React from 'react';
import { cn } from '@/lib/utils';
import './BandValueInput.css';

interface BandNumberProps {
  value: number;
  /** A typed number outside this range is not taken; `max` may be left open. */
  min: number;
  max?: number;
  onCommit: (value: number) => void;
  label: string;
}

/**
 * One number of the pair, as plain large text with a dotted rule: the only
 * hint that it takes typing. While it is focused its text is a draft, taken
 * as soon as it parses inside the range, so a half-typed number never moves
 * the band.
 */
const BandNumber: React.FC<BandNumberProps> = ({
  value,
  min,
  max,
  onCommit,
  label,
}) => {
  const [typed, setTyped] = React.useState<string | null>(null);
  const text = typed ?? String(value);

  const commit = (raw: string) => {
    const parsed = Number.parseFloat(raw.replace(',', '.'));
    if (!Number.isFinite(parsed)) return;
    if (parsed < min || (max !== undefined && parsed > max)) return;
    if (parsed !== value) onCommit(parsed);
  };

  return (
    <input
      className="band-value-number"
      type="text"
      inputMode="decimal"
      aria-label={label}
      value={text}
      /* Sized to its text, so the pair reads as one line of type. */
      style={{ width: `${Math.max(1, text.length)}ch` }}
      onChange={(e) => {
        setTyped(e.target.value);
        commit(e.target.value);
      }}
      onBlur={() => setTyped(null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === 'Escape') {
          setTyped(null);
          e.currentTarget.blur();
        }
      }}
    />
  );
};

interface BandValueInputProps extends Omit<
  React.ComponentProps<'div'>,
  'children'
> {
  target: number;
  tolerance: number;
  /** The range a typed target must fall in. */
  targetMin: number;
  targetMax: number;
  onTargetCommit: (target: number) => void;
  onToleranceCommit: (tolerance: number) => void;
  /** Shown after the pair ("kcal", "ml/kg"). */
  unit: string;
  /** The line under the pair, saying what the band comes to. */
  note?: React.ReactNode;
  targetLabel: string;
  toleranceLabel: string;
}

/** A band as its headline: target ± tolerance, both typeable, with a line under them. */
const BandValueInput = React.forwardRef<HTMLDivElement, BandValueInputProps>(
  (
    {
      target,
      tolerance,
      targetMin,
      targetMax,
      onTargetCommit,
      onToleranceCommit,
      unit,
      note,
      targetLabel,
      toleranceLabel,
      className,
      ...props
    },
    ref,
  ) => (
    <div className={cn('band-value-input', className)} ref={ref} {...props}>
      <div className="band-value-pair">
        <BandNumber
          value={target}
          min={targetMin}
          max={targetMax}
          onCommit={onTargetCommit}
          label={targetLabel}
        />
        <span className="band-value-sign" aria-hidden="true">
          ±
        </span>
        <BandNumber
          value={tolerance}
          min={0}
          onCommit={onToleranceCommit}
          label={toleranceLabel}
        />
        <small>{unit}</small>
      </div>
      {note != null && <p className="band-value-note">{note}</p>}
    </div>
  ),
);

BandValueInput.displayName = 'BandValueInput';

export { BandValueInput, type BandValueInputProps };
