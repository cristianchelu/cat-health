import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { TFunction } from 'i18next';
import { DEVICE_SIGNAL_KEYS, type DeviceSignal } from 'shared';
import { signalStrengthText } from '../signalQuality.ts';

/**
 * `t` stands in for the catalogue, echoing the key and its interpolations, so
 * these assert which string was chosen rather than what English says today.
 */
const t = ((key: string, vars?: Record<string, unknown>) =>
  vars ? `${key}|${JSON.stringify(vars)}` : key) as unknown as TFunction;

function strengthSignal(lit: number, of: number, dbm: number): DeviceSignal {
  return {
    key: DEVICE_SIGNAL_KEYS.SIGNAL_STRENGTH,
    label_key: `devices.signals.${DEVICE_SIGNAL_KEYS.SIGNAL_STRENGTH}`,
    value: { kind: 'number', value: dbm, unit: 'dBm' },
    display: { kind: 'segments', lit, of },
    icon: 'signal',
    category: 'drawer',
  };
}

const qualityOf = (lit: number, of = 4) => {
  const text = signalStrengthText(strengthSignal(lit, of, -58), t);
  return JSON.parse(text!.split('|')[1]).quality.replace(
    'devices.signals.quality.',
    '',
  );
};

describe('signalStrengthText', () => {
  it('names every rung of a four-bar ladder', () => {
    assert.equal(qualityOf(4), 'excellent');
    assert.equal(qualityOf(3), 'good');
    assert.equal(qualityOf(2), 'fair');
    assert.equal(qualityOf(1), 'weak');
    assert.equal(qualityOf(0), 'very_weak');
  });

  it('reads the bars, not the dBm', () => {
    /* The controller already mapped dBm onto its own radio's ladder. Two
     * readings 20 dB apart that landed on the same bar mean the same thing. */
    const wifi = signalStrengthText(strengthSignal(3, 4, -60), t);
    const surepet = signalStrengthText(strengthSignal(3, 4, -40), t);

    assert.ok(wifi?.includes('quality.good'));
    assert.ok(surepet?.includes('quality.good'));
  });

  it('scales to a ladder that is not four bars', () => {
    assert.equal(qualityOf(5, 5), 'excellent');
    assert.equal(qualityOf(3, 5), 'fair');
    assert.equal(qualityOf(0, 5), 'very_weak');
  });

  it('never claims no signal for a device that is reporting', () => {
    /* The bottom rung means the ladder ran out, not that the radio went quiet.
     * A device with nothing to say is offline, which is a different signal. */
    assert.equal(qualityOf(0), 'very_weak');
  });

  it('keeps the raw figure for anyone who wants to check it', () => {
    const text = signalStrengthText(strengthSignal(2, 4, -72), t);

    assert.ok(text?.startsWith('devices.signals.signal_strength_summary|'));
    assert.equal(JSON.parse(text.split('|')[1]).dbm, -72);
  });

  it('declines anything that is not a signal-strength reading', () => {
    const battery: DeviceSignal = {
      key: DEVICE_SIGNAL_KEYS.BATTERY,
      label_key: 'devices.signals.battery',
      value: { kind: 'percent', value: 80 },
      display: { kind: 'bar', fill: 0.8 },
      icon: 'battery',
      category: 'drawer_ranked',
    };

    assert.equal(signalStrengthText(battery, t), null);
  });

  it('declines a strength signal the provider sent without a number', () => {
    const noReading: DeviceSignal = {
      ...strengthSignal(2, 4, -72),
      value: { kind: 'none' },
    };

    assert.equal(signalStrengthText(noReading, t), null);
  });
});
