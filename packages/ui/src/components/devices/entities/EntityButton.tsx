import * as React from 'react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import './EntityControl.css';
import './EntityButton.css';

interface EntityButtonProps {
  label: string;
  pressLabel: string;
  className?: string;
}

/**
 * ESPHome-style button entity row: label + action affordance (not wired to device commands yet).
 */
export const EntityButton: React.FC<EntityButtonProps> = ({
  label,
  pressLabel,
  className,
}) => {
  return (
    <div className={cn('entity-control', 'entity-button', className)}>
      <div className="entity-info">
        <span className="entity-label">{label}</span>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="entity-button-action"
        onClick={() => {}}
      >
        {pressLabel}
      </Button>
    </div>
  );
};
