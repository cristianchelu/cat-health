import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { WaterFountainState } from 'shared';
import { Droplets, Filter, AlertCircle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import './WaterFountainStatus.css';

interface WaterFountainStatusProps {
  state: WaterFountainState;
  className?: string;
}

const WaterFountainStatus: React.FC<WaterFountainStatusProps> = ({
  state,
  className,
}) => {
  const { t } = useTranslation();

  const getFilterStatus = (days: number) => {
    if (days <= 0)
      return {
        label: t('devices.water_fountain.filter.replace'),
        class: 'status-error',
      };
    if (days <= 3)
      return {
        label: t('devices.water_fountain.filter.soon'),
        class: 'status-warning',
      };
    return {
      label: t('devices.water_fountain.filter.ok'),
      class: 'status-ok',
    };
  };

  const getWaterStatus = (days: number) => {
    if (days <= 0)
      return {
        label: t('devices.water_fountain.water.change'),
        class: 'status-error',
      };
    if (days <= 1)
      return {
        label: t('devices.water_fountain.water.soon'),
        class: 'status-warning',
      };
    return {
      label: t('devices.water_fountain.water.fresh'),
      class: 'status-ok',
    };
  };

  const filterStatus =
    state.filterDaysRemaining !== undefined
      ? getFilterStatus(state.filterDaysRemaining)
      : null;
  const waterStatus =
    state.waterDaysRemaining !== undefined
      ? getWaterStatus(state.waterDaysRemaining)
      : null;

  const hasSecondaryMetrics =
    waterStatus !== null || filterStatus !== null || state.pumpStatus !== undefined;

  return (
    <div className={cn('water-fountain-status', className)}>
      {/* Water Level - Primary Metric */}
      <div className="water-level-compact">
        <div className="level-info">
          <span className="label">
            {t('devices.water_fountain.water_level')}
          </span>
          <span
            className={cn('value', state.waterLevel < 10 ? 'text-error' : '')}
          >
            {state.waterLevel}%
          </span>
        </div>
        <div className="level-bar-bg">
          <div
            className={cn(
              'level-bar-fill',
              state.waterLevel < 10
                ? 'critical'
                : state.waterLevel < 25
                  ? 'low'
                  : '',
            )}
            style={{
              width: `${Math.max(0, Math.min(100, state.waterLevel))}%`,
            }}
          />
        </div>
      </div>

      {/* Secondary Metrics Grid - Only render if any metrics are available */}
      {hasSecondaryMetrics && (
        <div className="metrics-grid">
          {/* Water Quality */}
          {waterStatus !== null && (
            <div
              className={cn('metric-item', waterStatus.class)}
              title={t('devices.water_fountain.water.tooltip', {
                status: waterStatus.label,
              })}
            >
              <Droplets size={14} />
              <span className="metric-value">{state.waterDaysRemaining}d</span>
            </div>
          )}

          {/* Filter Status */}
          {filterStatus !== null && (
            <div
              className={cn('metric-item', filterStatus.class)}
              title={t('devices.water_fountain.filter.tooltip', {
                status: filterStatus.label,
              })}
            >
              <Filter size={14} />
              <span className="metric-value">{state.filterDaysRemaining}d</span>
            </div>
          )}

          {/* Pump Status */}
          {state.pumpStatus !== undefined && (
            <div
              className={cn(
                'metric-item',
                state.pumpStatus === 'ok' ? 'status-ok' : 'status-error',
              )}
              title={t('devices.water_fountain.pump.tooltip', {
                status:
                  state.pumpStatus === 'ok'
                    ? t('devices.water_fountain.pump.ok')
                    : t('devices.water_fountain.pump.error'),
              })}
            >
              {state.pumpStatus === 'ok' ? (
                <CheckCircle size={14} />
              ) : (
                <AlertCircle size={14} />
              )}
              <span className="metric-value">
                {state.pumpStatus === 'ok'
                  ? t('devices.water_fountain.pump.label')
                  : t('devices.water_fountain.pump.err_short')}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WaterFountainStatus;
