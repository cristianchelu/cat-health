import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { scoreDeviceSignal, type SignalDisplay } from 'shared';
import { DepositPips } from '@/components/ui/DepositPips';
import { Meter, type MeterTone } from '@/components/ui/Meter';
import { SegmentMeter } from '@/components/ui/SegmentMeter';
import { SplitMeter } from '@/components/ui/SplitMeter';
import { SignalValue } from '@/components/devices/SignalValue';

interface SignalGaugeProps {
  /** The signal's metric key, used to score each half of a split gauge. */
  signalKey: string;
  display: SignalDisplay;
  tone: MeterTone;
  label: string;
  /** Readings are last-known, so no gauge draws a fill. */
  stale?: boolean;
}

/**
 * Draws whichever gauge a signal declared.
 *
 * The card never asks what kind of device it is looking at. It asks the signal
 * how it can be drawn, which is what lets one card serve a fountain, a feeder
 * and a litterbox without branching on any of them.
 */
export const SignalGauge: React.FC<SignalGaugeProps> = ({
  signalKey,
  display,
  tone,
  label,
  stale,
}) => {
  const { t } = useTranslation();
  const effectiveTone: MeterTone = stale ? 'stale' : tone;
  const cellTone = (fill: number): MeterTone =>
    scoreDeviceSignal({
      key: signalKey,
      severity: { kind: 'percent', value: fill * 100 },
    }).tone;

  switch (display.kind) {
    case 'bar':
      return (
        <Meter
          value={stale ? 0 : display.fill}
          tone={effectiveTone}
          label={label}
        />
      );

    case 'segments':
      return (
        <SegmentMeter
          lit={stale ? 0 : display.lit}
          of={display.of}
          tone={effectiveTone}
          label={label}
        />
      );

    case 'pips':
      return (
        <DepositPips
          pips={stale ? [] : display.pips}
          of={display.of}
          label={label}
          valueText={t('devices.signals.units.deposits', {
            count: display.pips.length,
          })}
        />
      );

    case 'split':
      /* Each half is scored on its own: one empty bowl beside a full one is a
       * real alarm, and averaging the pair would hide it. */
      return (
        <SplitMeter
          cells={[
            {
              label: t(display.cells[0].label_key),
              value: (
                <SignalValue value={display.cells[0].value} stale={stale} />
              ),
              fill: stale ? 0 : display.cells[0].fill,
              tone: stale ? 'stale' : cellTone(display.cells[0].fill),
            },
            {
              label: t(display.cells[1].label_key),
              value: (
                <SignalValue value={display.cells[1].value} stale={stale} />
              ),
              fill: stale ? 0 : display.cells[1].fill,
              tone: stale ? 'stale' : cellTone(display.cells[1].fill),
            },
          ]}
        />
      );

    case 'none':
      /* An empty track. A device with nothing to draw still holds the slot, so
       * cards in a grid keep their rows aligned. */
      return <Meter value={0} tone="stale" label={label} />;
  }
};
