import * as React from 'react';
import { Switch } from '@/components/ui/Switch';
import { cn } from '@/lib/utils';
import './EntityControl.css';

interface EntitySwitchProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  icon?: React.ReactNode;
  className?: string;
}

export const EntitySwitch: React.FC<EntitySwitchProps> = ({
  label,
  checked,
  onChange,
  icon,
  className,
}) => {
  return (
    <div className={cn('entity-control', className)}>
      <div className="entity-info">
        {icon && <div className="entity-icon">{icon}</div>}
        <span className="entity-label">{label}</span>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
};
