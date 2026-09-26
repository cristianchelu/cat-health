import * as React from 'react';
import type { ControlValueType } from 'shared';
import { FormTile, Input, Select } from '@/components/ui/form';
import { Switch } from '@/components/ui/Switch';
import type { ControlDraftValue } from '@/lib/deviceControlDraft';
import { cn } from '@/lib/utils';
import './ControlTile.css';

interface ControlTileProps {
  label: string;
  type: ControlValueType;
  value: ControlDraftValue;
  onChange: (value: ControlDraftValue) => void;
  /**
   * A number is typed a character at a time, so it is only final once the
   * field loses focus or Enter is pressed. Switches and selects are final on
   * change.
   */
  onCommit?: () => void;
  disabled?: boolean;
  /** Set while a write is in flight; what a screen reader hears. */
  busyLabel?: string;
  error?: string;
  className?: string;
}

/** One device setting as a tile, drawn from its value type. */
const ControlTile: React.FC<ControlTileProps> = ({
  label,
  type,
  value,
  onChange,
  onCommit,
  disabled,
  busyLabel,
  error,
  className,
}) => {
  const id = React.useId();

  const control = (() => {
    switch (type.kind) {
      case 'boolean':
        return (
          <Switch
            id={id}
            checked={value === true}
            onCheckedChange={onChange}
            disabled={disabled}
          />
        );
      case 'number':
        return (
          <div className="control-tile-number">
            <Input
              id={id}
              className="control-tile-input"
              type="number"
              inputMode="decimal"
              value={typeof value === 'string' ? value : ''}
              min={type.min}
              max={type.max}
              step={type.step ?? 'any'}
              onChange={(event) => onChange(event.target.value)}
              onBlur={onCommit}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && onCommit) {
                  event.preventDefault();
                  onCommit();
                }
              }}
              disabled={disabled}
              variant={error ? 'error' : 'default'}
            />
            {type.unit ? (
              <span className="control-tile-unit">{type.unit}</span>
            ) : null}
          </div>
        );
      case 'enum':
        return (
          <Select
            id={id}
            className="control-tile-select"
            value={typeof value === 'string' ? value : ''}
            placeholder={value === '' ? '—' : undefined}
            options={type.options.map((option) => ({
              value: option.value,
              label: option.label.text,
            }))}
            onChange={(event) => onChange(event.target.value)}
            disabled={disabled}
            variant={error ? 'error' : 'default'}
          />
        );
    }
  })();

  return (
    <FormTile
      className={cn('control-tile', className)}
      label={label}
      htmlFor={id}
      busyLabel={busyLabel}
      error={error}
    >
      {control}
    </FormTile>
  );
};

export { ControlTile, type ControlTileProps };
