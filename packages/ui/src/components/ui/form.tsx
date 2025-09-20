import * as React from 'react';
import { cn } from '@/lib/utils';
import './forms.css';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  fullWidth?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    { className, label, error, helperText, fullWidth = true, ...props },
    ref,
  ) => {
    const id = React.useId();

    return (
      <div className={cn('form-group', fullWidth ? 'w-full' : '', className)}>
        {label && (
          <label htmlFor={id} className="form-label">
            {label}
          </label>
        )}
        <input
          id={id}
          className={cn('form-input', error ? 'invalid' : '')}
          ref={ref}
          {...props}
        />
        {error && <p className="form-error">{error}</p>}
        {helperText && <p className="form-helper">{helperText}</p>}
      </div>
    );
  },
);

Input.displayName = 'Input';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options: { value: string; label: string }[];
  fullWidth?: boolean;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      className,
      label,
      error,
      helperText,
      options,
      fullWidth = true,
      ...props
    },
    ref,
  ) => {
    const id = React.useId();

    return (
      <div className={cn('form-group', fullWidth ? 'w-full' : '', className)}>
        {label && (
          <label htmlFor={id} className="form-label">
            {label}
          </label>
        )}
        <select
          id={id}
          className={cn('form-input form-select', error ? 'invalid' : '')}
          ref={ref}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {error && <p className="form-error">{error}</p>}
        {helperText && <p className="form-helper">{helperText}</p>}
      </div>
    );
  },
);

Select.displayName = 'Select';

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  helperText?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, error, helperText, ...props }, ref) => {
    const id = React.useId();

    return (
      <div className={cn('form-group', className)}>
        <label className="form-checkbox" htmlFor={id}>
          <input type="checkbox" id={id} ref={ref} {...props} />
          <span>{label}</span>
        </label>
        {error && <p className="form-error">{error}</p>}
        {helperText && <p className="form-helper">{helperText}</p>}
      </div>
    );
  },
);

Checkbox.displayName = 'Checkbox';

interface FormProps extends React.FormHTMLAttributes<HTMLFormElement> {}

export const Form = React.forwardRef<HTMLFormElement, FormProps>(
  ({ className, ...props }, ref) => {
    return <form className={className} ref={ref} {...props} />;
  },
);

Form.displayName = 'Form';
