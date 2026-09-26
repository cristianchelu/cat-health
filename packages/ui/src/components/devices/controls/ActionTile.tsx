import * as React from 'react';
import { Button } from '@/components/ui/Button';
import { FormTile } from '@/components/ui/form';
import { cn } from '@/lib/utils';

interface ActionTileProps {
  label: string;
  runLabel: string;
  onRun: () => void;
  disabled?: boolean;
  /** Set while the action is running; what a screen reader hears. */
  busyLabel?: string;
  error?: string;
  className?: string;
}

/** One device action as a tile: its name, and the button that runs it. */
const ActionTile: React.FC<ActionTileProps> = ({
  label,
  runLabel,
  onRun,
  disabled,
  busyLabel,
  error,
  className,
}) => {
  const id = React.useId();
  return (
    <FormTile
      className={cn('action-tile', className)}
      label={label}
      htmlFor={id}
      busyLabel={busyLabel}
      error={error}
    >
      <Button
        id={id}
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || Boolean(busyLabel)}
        onClick={onRun}
      >
        {runLabel}
      </Button>
    </FormTile>
  );
};

export { ActionTile, type ActionTileProps };
