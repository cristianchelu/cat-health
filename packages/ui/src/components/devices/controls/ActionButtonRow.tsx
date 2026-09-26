import * as React from 'react';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import './ActionButtonRow.css';

interface ActionButtonRowItem {
  key: string;
  label: string;
  disabled?: boolean;
  running?: boolean;
  /** Why the last run failed, already worded. */
  error?: string;
}

interface ActionButtonRowProps {
  actions: ActionButtonRowItem[];
  onRun: (key: string) => void;
  className?: string;
}

/** A device's one-off actions as a row of small buttons. */
const ActionButtonRow: React.FC<ActionButtonRowProps> = ({
  actions,
  onRun,
  className,
}) => {
  const errors = actions.filter((action) => action.error);
  return (
    <div className={cn('action-button-row', className)}>
      <div className="action-button-row-buttons">
        {actions.map((action) => (
          <Button
            key={action.key}
            type="button"
            variant="outline"
            size="sm"
            disabled={action.disabled || action.running}
            onClick={() => onRun(action.key)}
          >
            {action.running ? <Spinner aria-hidden /> : null}
            {action.label}
          </Button>
        ))}
      </div>
      {errors.map((action) => (
        <p key={action.key} className="action-button-row-error" role="alert">
          {action.label}: {action.error}
        </p>
      ))}
    </div>
  );
};

export { ActionButtonRow, type ActionButtonRowItem, type ActionButtonRowProps };
