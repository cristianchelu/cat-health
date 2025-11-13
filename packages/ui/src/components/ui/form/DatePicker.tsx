import * as React from 'react';
import { cn } from '@/lib/utils';
import { Input } from './Input';
import './DatePicker.css';

interface DatePickerProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  variant?: 'default' | 'error';
  inputSize?: 'sm' | 'md' | 'lg';
  label?: string;
  error?: string;
}

const DatePicker = React.forwardRef<HTMLInputElement, DatePickerProps>(
  (
    {
      className,
      variant = 'default',
      inputSize = 'md',
      value,
      onChange,
      ...props
    },
    ref,
  ) => {
    // Format date for display (YYYY-MM-DD format for input[type="date"])
    const formatValueForInput = (
      dateValue: string | number | readonly string[] | undefined,
    ): string => {
      if (!dateValue) return '';

      try {
        const date = new Date(String(dateValue));
        if (isNaN(date.getTime())) return '';

        return date.toISOString().split('T')[0];
      } catch {
        return '';
      }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange?.(e);
    };

    return (
      <Input
        type="date"
        className={cn('date-picker', className)}
        variant={variant}
        inputSize={inputSize}
        value={formatValueForInput(value)}
        onChange={handleChange}
        ref={ref}
        {...props}
      />
    );
  },
);

DatePicker.displayName = 'DatePicker';

export { DatePicker, type DatePickerProps };
