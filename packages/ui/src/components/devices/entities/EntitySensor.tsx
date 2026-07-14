import * as React from 'react';
import { formatSensorNumericDisplay } from '@/lib/formatSensorNumericDisplay';
import { cn } from '@/lib/utils';
import { useFormatters } from '@/contexts/RegionalPreferencesProvider';
import './EntityControl.css';

interface EntitySensorProps {
  label: string;
  value: string | number;
  unit?: string;
  /** When set (ESPHome sensors), numeric values use this decimal precision. */
  accuracyDecimals?: number;
  /** ESPHome device_class — used when firmware omits `accuracy_decimals`. */
  deviceClass?: string;
  /** e.g. absolute timestamp tooltip for relative display values */
  valueTitle?: string;
  /**
   * `metric` — tabular headline size for numbers (default).
   * `body` — normal reading size for prose (relative times, text sensors).
   */
  valueVariant?: 'metric' | 'body';
  icon?: React.ReactNode;
  className?: string;
}

export const EntitySensor: React.FC<EntitySensorProps> = ({
  label,
  value,
  unit,
  accuracyDecimals,
  deviceClass,
  valueTitle,
  valueVariant = 'metric',
  icon,
  className,
}) => {
  const { formatNumber } = useFormatters();
  const displayValue =
    typeof value === 'number'
      ? formatSensorNumericDisplay(value, {
          accuracyDecimals,
          unit,
          deviceClass,
          formatGroupedNumber: (numericValue) => formatNumber(numericValue),
        })
      : value;

  return (
    <div className={cn('entity-control', className)}>
      <div className="entity-info">
        {icon && <div className="entity-icon">{icon}</div>}
        <span className="entity-label">{label}</span>
      </div>
      <div
        className={cn('entity-value', valueVariant === 'body' && 'is-body')}
        title={valueTitle}
      >
        {displayValue}
        {unit && <span className="unit">{unit}</span>}
      </div>
    </div>
  );
};
