import * as React from 'react';
import { Select } from '@/components/ui/form/Select';
import { cn } from '@/lib/utils';
import './EntityControl.css';

interface EntitySelectProps {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  icon?: React.ReactNode;
  className?: string;
}

export const EntitySelect: React.FC<EntitySelectProps> = ({
  label,
  value,
  options,
  onChange,
  icon,
  className,
}) => {
  const selectOptions = options.map((opt) => ({ value: opt, label: opt }));

  return (
    <div className={cn('entity-control', className)}>
      <div className="entity-info">
        {icon && <div className="entity-icon">{icon}</div>}
        <span className="entity-label">{label}</span>
      </div>
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        options={selectOptions}
        className="entity-select"
      />
    </div>
  );
};
