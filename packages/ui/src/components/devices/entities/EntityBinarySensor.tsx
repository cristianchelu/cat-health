import * as React from 'react';
import { cn } from '@/lib/utils';
import './EntityControl.css';

interface EntityBinarySensorProps {
  label: string;
  isOn: boolean;
  onLabel?: string;
  offLabel?: string;
  icon?: React.ReactNode;
  className?: string;
}

export const EntityBinarySensor: React.FC<EntityBinarySensorProps> = ({
  label,
  isOn,
  onLabel = 'On',
  offLabel = 'Off',
  icon,
  className,
}) => {
  return (
    <div className={cn('entity-control', className)}>
      <div className="entity-info">
        {icon && <div className="entity-icon">{icon}</div>}
        <span className="entity-label">{label}</span>
      </div>
      <div className={cn('entity-value', isOn ? 'is-active' : 'is-inactive')}>
        {isOn ? onLabel : offLabel}
      </div>
    </div>
  );
};
