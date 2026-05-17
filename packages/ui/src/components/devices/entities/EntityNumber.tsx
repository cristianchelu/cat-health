import * as React from 'react';
import { Input } from '@/components/ui/form/Input';
import { roundEntityNumericValue } from '@/lib/formatSensorNumericDisplay';
import { cn } from '@/lib/utils';
import './EntityControl.css';

interface EntityNumberProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  deviceClass?: string;
  icon?: React.ReactNode;
  className?: string;
}

export const EntityNumber: React.FC<EntityNumberProps> = ({
  label,
  value,
  onChange,
  min,
  max,
  step,
  unit,
  deviceClass,
  icon,
  className,
}) => {
  const displayValue = roundEntityNumericValue(value, {
    step,
    unit,
    deviceClass,
  });

  return (
    <div className={cn('entity-control', className)}>
      <div className="entity-info">
        {icon && <div className="entity-icon">{icon}</div>}
        <span className="entity-label">{label}</span>
      </div>
      <div className="entity-input-group">
        <Input
          type="number"
          value={displayValue}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          min={min}
          max={max}
          step={step}
        />
        {unit && <span className="entity-unit">{unit}</span>}
      </div>
    </div>
  );
};
