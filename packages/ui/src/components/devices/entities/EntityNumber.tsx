import * as React from 'react';
import { Input } from '@/components/ui/form/Input';
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
  icon,
  className,
}) => {
  return (
    <div className={cn('entity-control', className)}>
      <div className="entity-info">
        {icon && <div className="entity-icon">{icon}</div>}
        <span className="entity-label">{label}</span>
      </div>
      <div className="entity-input-group">
        <Input
          type="number"
          value={value}
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
