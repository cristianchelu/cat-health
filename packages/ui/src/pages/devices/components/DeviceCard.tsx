import * as React from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  DEVICE_SIGNAL_KEYS,
  scoreDeviceSignal,
  type DeviceListItemDTO,
  type DeviceSignal,
} from 'shared';
import { getDeviceIcon } from '@/components/icons/deviceIcons';
import { AttentionIcon } from '@/components/ui/AttentionIcon';
import { BatteryLevel } from '@/components/ui/BatteryLevel';
import { Meter } from '@/components/ui/Meter';
import { SignalStrength } from '@/components/ui/SignalStrength';
import { Tooltip } from '@/components/ui/Tooltip';
import { SignalValue } from '@/components/devices/SignalValue';
import { getSignalIcon } from '@/components/devices/signalIcons';
import { useDeviceSlots } from '@/hooks/useDeviceSlots';
import type { RankedSignal } from '@/lib/deviceSignalRanking';
import { signalStrengthText } from '@/lib/signalQuality';
import { getDeviceModel } from './devicePageRegistry';
import {
  getProviderBrand,
  providerBrandLabel,
} from '@/pages/settings/provider-wizard/flows/providerBrandRegistry.ts';
import { SignalGauge } from './SignalGauge';
import { cn } from '@/lib/utils';
import './DeviceCard.css';

interface DeviceCardProps {
  device: DeviceListItemDTO;
  className?: string;
}

const STATUS_CLASS: Record<string, string> = {
  online: 'online',
  offline: 'offline',
  error: 'error',
};

/**
 * One device, as four tiers at fixed heights: identity, the gauge, two meta
 * lines, and a status drawer.
 *
 * The tiers never change shape. What changes is which of the device's signals
 * occupies each one, decided by `useDeviceSlots`, so a card carries the most
 * useful thing that device can currently say without the grid reflowing when
 * that changes.
 */
const DeviceCard: React.FC<DeviceCardProps> = ({ device, className }) => {
  const { t } = useTranslation();
  const { gauge, meta, drawer, attention, stale } = useDeviceSlots(
    device.signals,
  );

  const model =
    getDeviceModel(device) ??
    providerBrandLabel(getProviderBrand(device.provider), t);

  return (
    <Link
      to={`/devices/${device.id}`}
      className={cn('device-card', className)}
      aria-label={device.name}
    >
      <div className="device-card-head">
        <span className="device-card-tile">
          {getDeviceIcon(device.type)}
          <span
            className={cn(
              'device-card-status',
              STATUS_CLASS[device.status ?? ''] ?? 'unknown',
            )}
            title={t(`devices.status.${device.status ?? 'unknown'}`)}
          />
        </span>

        <span className="device-card-identity">
          <span className="device-card-name">{device.name}</span>
          <span className="device-card-model">{model}</span>
        </span>

        {/* Wide cards have room to carry the drawer up here; narrow ones don't. */}
        <span className="device-card-drawer inline">
          <DrawerCells signals={drawer} />
        </span>

        {attention ? (
          <AttentionIcon
            tone={attention}
            label={t(`devices.attention.${attention}`)}
          />
        ) : null}
      </div>

      <div className="device-card-body">
        <div className="device-card-primary">
          {gauge ? (
            <>
              {/* A split gauge labels its own halves, so the row above it would
                  only repeat them. */}
              {gauge.signal.display.kind === 'split' ? null : (
                <div className="device-card-primary-row">
                  <span className="device-card-primary-label">
                    {t(gauge.signal.label_key)}
                  </span>
                  <span
                    className={cn(
                      'device-card-primary-value',
                      'tone',
                      stale ? 'stale' : gauge.tone,
                    )}
                  >
                    <SignalValue value={gauge.signal.value} stale={stale} />
                  </span>
                </div>
              )}
              <div className="device-card-gauge">
                <SignalGauge
                  signalKey={gauge.signal.key}
                  display={gauge.signal.display}
                  tone={gauge.tone}
                  label={t(gauge.signal.label_key)}
                  stale={stale}
                />
              </div>
            </>
          ) : (
            /* A device can be reachable and still have told us nothing yet —
               a cloud account mid-first-sync, or one restored from a backup.
               Saying so beats an empty card, which reads as a broken one. */
            <>
              <div className="device-card-primary-row">
                <span className="device-card-primary-label">
                  {t('devices.signals.no_readings')}
                </span>
                <span className="device-card-primary-value tone stale">
                  {'—'}
                </span>
              </div>
              <div className="device-card-gauge">
                <Meter
                  value={0}
                  tone="stale"
                  label={t('devices.signals.no_readings')}
                />
              </div>
            </>
          )}
        </div>

        <div className="device-card-meta">
          {meta.map((entry) => (
            <MetaSignalLine key={entry.signal.key} entry={entry} />
          ))}
        </div>
      </div>

      <div className="device-card-drawer footer">
        <DrawerCells signals={drawer} />
      </div>
    </Link>
  );
};

/**
 * A demoted signal. A level that lost the gauge keeps a short bar so its
 * severity still reads at a glance, which is what the colour is for.
 */
const MetaSignalLine: React.FC<{ entry: RankedSignal }> = ({ entry }) => {
  const { t } = useTranslation();
  const { signal, tone } = entry;
  const bar = signal.display.kind === 'bar' ? signal.display : null;

  return (
    <div className={cn('device-card-meta-line', 'tone', tone)}>
      <span className="device-card-meta-icon" aria-hidden="true">
        {getSignalIcon(signal.icon)}
      </span>
      <span className="device-card-meta-label">{t(signal.label_key)}</span>
      {bar ? (
        <Meter
          value={bar.fill}
          tone={tone}
          size="sm"
          label={t(signal.label_key)}
          className="device-card-meta-bar"
        />
      ) : null}
      <span className="device-card-meta-value">
        <SignalValue value={signal.value} />
      </span>
    </div>
  );
};

/**
 * Signal strength, battery and recognition, drawn wherever the drawer sits.
 *
 * Every cell is a coarse reading by construction — four bars, three cells, or
 * a bare icon — so the exact figure lives in a tooltip rather than in a meta
 * line. A line would put the same reading on the card twice, inches from the
 * glyph, which reads as a fault rather than as detail.
 *
 * Pointer and keyboard only. Where the number matters on a phone, the device's
 * own page carries it in text, which is a tap away from here.
 */
const DrawerCells: React.FC<{ signals: readonly DeviceSignal[] }> = ({
  signals,
}) => (
  <>
    {signals.map((signal) => (
      <Tooltip key={signal.key} content={<DrawerDetail signal={signal} />}>
        {/*
         * The trigger has to be this span rather than the cell itself:
         * Radix clones its child to attach handlers, and the cells are not
         * all components that forward what it passes.
         */}
        <span className="device-card-drawer-cell">
          <DrawerCell signal={signal} />
        </span>
      </Tooltip>
    ))}
  </>
);

/**
 * What the glyph is too coarse to say.
 *
 * Signal strength gets words rather than the raw figure: a bar count has no
 * legend and "-55 dBm" means nothing without one. Everything else already
 * reports in units a person reads, so it goes through `SignalValue` unchanged.
 */
const DrawerDetail: React.FC<{ signal: DeviceSignal }> = ({ signal }) => {
  const { t } = useTranslation();
  const label = t(signal.label_key);
  const strength = signalStrengthText(signal, t);

  if (strength) {
    return <>{`${label}: ${strength}`}</>;
  }

  if (signal.value.kind === 'none') {
    return <>{label}</>;
  }

  return (
    <>
      {label}
      {': '}
      <SignalValue value={signal.value} />
    </>
  );
};

/** The glyph for one drawer signal, at whatever fidelity it supports. */
const DrawerCell: React.FC<{ signal: DeviceSignal }> = ({ signal }) => {
  const { t } = useTranslation();

  if (
    signal.key === DEVICE_SIGNAL_KEYS.SIGNAL_STRENGTH &&
    signal.display.kind === 'segments'
  ) {
    /* The same words the tooltip shows, so a screen reader and a pointer are
     * told the same thing rather than "Signal" and "Signal: Good (-58 dBm)". */
    const strength = signalStrengthText(signal, t);
    const label = t('devices.signals.signal_strength');

    return (
      <SignalStrength
        lit={signal.display.lit}
        of={signal.display.of}
        label={strength ? `${label}: ${strength}` : label}
      />
    );
  }

  if (
    signal.key === DEVICE_SIGNAL_KEYS.BATTERY &&
    signal.value.kind === 'percent'
  ) {
    return (
      <BatteryLevel
        percent={signal.value.value}
        tone={batteryTone(signal.value.value)}
        label={t('devices.signals.units.battery', {
          value: signal.value.value,
        })}
      />
    );
  }

  return (
    <span className="device-card-drawer-icon">
      {getSignalIcon(signal.icon)}
    </span>
  );
};

const batteryTone = (percent: number) =>
  scoreDeviceSignal({
    key: DEVICE_SIGNAL_KEYS.BATTERY,
    severity: { kind: 'percent', value: percent },
  }).tone;

export default DeviceCard;
