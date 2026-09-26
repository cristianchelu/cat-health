import * as React from 'react';
import type { ControlValueType } from 'shared';
import {
  FormField,
  Input,
  LabeledSwitchField,
  Select,
} from '@/components/ui/form';
import type { ControlDraftValue } from '@/lib/deviceControlDraft';
import { cn } from '@/lib/utils';
import './ControlField.css';

interface ControlFieldProps {
  label: string;
  type: ControlValueType;
  value: ControlDraftValue;
  onChange: (value: ControlDraftValue) => void;
  disabled?: boolean;
  /** A write in flight, already worded. */
  status?: string;
  error?: string;
  className?: string;
}

/** One device setting as a field, drawn from its value type. */
const ControlField: React.FC<ControlFieldProps> = ({
  label,
  type,
  value,
  onChange,
  disabled,
  status,
  error,
  className,
}) => {
  const id = React.useId();

  const control = (() => {
    switch (type.kind) {
      case 'boolean':
        return (
          <LabeledSwitchField
            id={id}
            checked={value === true}
            onCheckedChange={onChange}
            disabled={disabled}
          />
        );
      case 'number':
        return (
          <div className="control-field-number">
            <Input
              id={id}
              type="number"
              inputMode="decimal"
              value={typeof value === 'string' ? value : ''}
              min={type.min}
              max={type.max}
              step={type.step ?? 'any'}
              onChange={(event) => onChange(event.target.value)}
              disabled={disabled}
              variant={error ? 'error' : 'default'}
            />
            {type.unit ? (
              <span className="control-field-unit">{type.unit}</span>
            ) : null}
          </div>
        );
      case 'enum':
        return (
          <Select
            id={id}
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
    <FormField
      className={cn('control-field', className)}
      label={label}
      htmlFor={id}
      error={error}
    >
      {control}
      {status ? <p className="control-field-status">{status}</p> : null}
    </FormField>
  );
};

export { ControlField, type ControlFieldProps };
