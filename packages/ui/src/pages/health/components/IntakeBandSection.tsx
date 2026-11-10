import * as React from 'react';

import { BandValueInput } from '@/components/ui/BandValueInput';
import { FormCard, FormCardBody } from '@/components/ui/form/FormCard';
import { LabeledSwitchField } from '@/components/ui/form/LabeledSwitchField';
import {
  LabelValueRows,
  type LabelValueRow,
} from '@/components/ui/LabelValueRows';
import { SectionHeader } from '@/components/ui/SectionHeader';
import {
  ToleranceSlider,
  type ToleranceSliderNotch,
} from '@/components/ui/ToleranceSlider';

import type { BandDraft, BandScale } from '../dietaryNeedsModel';
import './IntakeBandSection.css';

interface IntakeBandSectionProps {
  icon: React.ReactNode;
  title: string;
  tracked: boolean;
  onTrackedChange: (tracked: boolean) => void;
  trackedLabel: string;
  untrackedLabel: string;
  /** Accessible name of the Tracked switch. */
  trackSwitchLabel: string;
  /** The band being edited; null when its preset has no band today. */
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
 * One band of the Dietary needs form: its Tracked switch, and while tracked
 * the band as a typeable headline, the slider with its notches, and what the
 * band comes to. Everything arrives resolved and formatted.
 */
const IntakeBandSection: React.FC<IntakeBandSectionProps> = ({
  icon,
  title,
  tracked,
  onTrackedChange,
  trackedLabel,
  untrackedLabel,
  trackSwitchLabel,
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
  <section className="intake-band-section">
    <SectionHeader
      size="compact"
      icon={icon}
      actions={
        <LabeledSwitchField
          checked={tracked}
          onCheckedChange={onTrackedChange}
          enabledLabel={trackedLabel}
          disabledLabel={untrackedLabel}
          aria-label={trackSwitchLabel}
        />
      }
    >
      {title}
    </SectionHeader>
    {tracked && (
      <FormCard>
        <FormCardBody>
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
        </FormCardBody>
      </FormCard>
    )}
  </section>
);

export { IntakeBandSection, type IntakeBandSectionProps };
