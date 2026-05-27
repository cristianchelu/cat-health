import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { SureFeederState } from 'shared';
import { Battery, Signal } from 'lucide-react';
import { cn } from '@/lib/utils';
import './SureFeederStatus.css';

interface SureFeederStatusProps {
  state: SureFeederState;
  className?: string;
}

function getFillLevelClass(percent: number): string {
  if (percent < 10) {
    return 'critical';
  }
  if (percent < 25) {
    return 'low';
  }
  return '';
}

function formatFillPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return '—';
  }
  return `${Math.round(value)}%`;
}

const SureFeederStatus: React.FC<SureFeederStatusProps> = ({
  state,
  className,
}) => {
  const { t } = useTranslation();

  const totalFill = state.fill_percentages?.total ?? null;
  const hasFillLevel = totalFill != null && Number.isFinite(totalFill);
  const hasBattery = state.battery_percent != null;
  const hasRssi = state.device_rssi != null;
  const hasSecondaryMetrics = hasBattery || hasRssi;

  return (
    <div className={cn('sure-feeder-status', className)}>
      <div className="fill-level-compact">
        <div className="level-info">
          <span className="label">{t('devices.feeder.fill_level')}</span>
          <span
            className={cn(
              'value',
              hasFillLevel && totalFill < 10 ? 'text-error' : '',
            )}
          >
            {formatFillPercent(totalFill)}
          </span>
        </div>
        <div className="level-bar-bg">
          <div
            className={cn(
              'level-bar-fill',
              hasFillLevel ? getFillLevelClass(totalFill) : 'empty',
            )}
            style={{
              width: hasFillLevel
                ? `${Math.max(0, Math.min(100, totalFill))}%`
                : '0%',
            }}
          />
        </div>
      </div>

      {hasSecondaryMetrics ? (
        <div className="metrics-grid">
          {hasBattery ? (
            <div
              className={cn(
                'metric-item',
                state.battery_percent! <= 15
                  ? 'status-error'
                  : state.battery_percent! <= 30
                    ? 'status-warning'
                    : 'status-ok',
              )}
              title={t('devices.feeder.battery.tooltip', {
                percent: state.battery_percent,
              })}
            >
              <Battery size={14} />
              <span className="metric-value">{state.battery_percent}%</span>
            </div>
          ) : null}

          {hasRssi ? (
            <div
              className="metric-item"
              title={t('devices.feeder.signal.tooltip', {
                rssi: state.device_rssi,
              })}
            >
              <Signal size={14} />
              <span className="metric-value">{state.device_rssi} dBm</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default SureFeederStatus;
