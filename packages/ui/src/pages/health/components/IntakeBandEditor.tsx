import * as React from 'react';

import { BandValueInput } from '@/components/ui/BandValueInput';
import {
  LabelValueRows,
  type LabelValueRow,
} from '@/components/ui/LabelValueRows';
import {
  ToleranceSlider,
  type ToleranceSliderNotch,
} from '@/components/ui/ToleranceSlider';

import type { BandDraft, BandScale } from '../dietaryNeedsModel';
import './IntakeBandEditor.css';

interface IntakeBandEditorProps {
  /** The band being edited; null when there is none to edit today. */
  band: BandDraft | null;
  /** Said in the band's place when there is none. */
  noBandNotice: string;
  unit: string;
  /** The line under the band, saying what it comes to. */
  note: string;
  /** A mark after the note, such as where the band's numbers come from. */
  hint?: React.ReactNode;
  scale: BandScale;
  notches: readonly ToleranceSliderNotch[];
  activeNotch: string | null;
  onTargetChange: (target: number) => void;
  onToleranceChange: (tolerance: number) => void;
  onNotchSelect: (key: string) => void;
  targetLabel: string;
  toleranceLabel: string;
  /** What the band comes to, one fact a line. */
  rows: readonly LabelValueRow[];
  /** A field between the slider and the rows: the food band's target weight. */
  children?: React.ReactNode;
}

/**
 * A band as it is edited: the typeable headline, the slider with its notches,
 * and what the band comes to. Everything arrives resolved and formatted.
 */
const IntakeBandEditor: React.FC<IntakeBandEditorProps> = ({
  band,
  noBandNotice,
  unit,
  note,
  hint,
  scale,
  notches,
  activeNotch,
  onTargetChange,
  onToleranceChange,
  onNotchSelect,
  targetLabel,
  toleranceLabel,
  rows,
  children,
}) => (
  <div className="intake-band-editor">
    {band ? (
      <>
        <BandValueInput
          target={band.target}
          tolerance={band.tolerance}
          targetMin={scale.min}
          targetMax={scale.max}
          onTargetCommit={onTargetChange}
          onToleranceCommit={onToleranceChange}
          unit={unit}
          note={
            <>
              {note} {hint}
            </>
          }
          targetLabel={targetLabel}
          toleranceLabel={toleranceLabel}
        />
        <ToleranceSlider
          target={band.target}
          tolerance={band.tolerance}
          min={scale.min}
          max={scale.max}
          step={scale.step}
          notches={notches}
          activeNotch={activeNotch}
          onTargetChange={onTargetChange}
          onToleranceChange={onToleranceChange}
          onNotchSelect={onNotchSelect}
          targetLabel={targetLabel}
          toleranceLabel={toleranceLabel}
          targetValueText={`${band.target} ${unit}`}
          toleranceValueText={`± ${band.tolerance} ${unit}`}
        />
      </>
    ) : (
      <p className="intake-band-notice">{noBandNotice}</p>
    )}
    {children}
    {band && <LabelValueRows rows={rows} />}
  </div>
);

export { IntakeBandEditor, type IntakeBandEditorProps };
