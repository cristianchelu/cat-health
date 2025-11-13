import * as React from 'react';
import { cn } from '@/lib/utils';
import './Select.css';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  variant?: 'default' | 'error';
  inputSize?: 'sm' | 'md' | 'lg';
  options: SelectOption[];
  placeholder?: string;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      className,
      variant = 'default',
      inputSize = 'md',
      options,
      placeholder,
      children,
      ...props
    },
    ref,
  ) => {
    return (
      <select
        className={cn('select', variant, inputSize, className)}
        ref={ref}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
        {children}
      </select>
    );
  },
);

Select.displayName = 'Select';

export { Select, type SelectProps, type SelectOption };
