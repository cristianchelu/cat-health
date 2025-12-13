import * as React from 'react';
import { cn } from '@/lib/utils';
import './EntityControl.css';

interface EntitySensorProps {
  label: string;
  value: string | number;
  unit?: string;
  icon?: React.ReactNode;
  className?: string;
}

export const EntitySensor: React.FC<EntitySensorProps> = ({
  label,
  value,
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
      <div className="entity-value">
        {value}
        {unit && <span className="unit">{unit}</span>}
      </div>
    </div>
  );
};
