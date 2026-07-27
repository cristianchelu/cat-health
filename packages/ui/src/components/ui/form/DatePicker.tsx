import * as React from 'react';
import { format } from 'date-fns';
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

      const raw = String(dateValue);

      /*
       * Already a plain calendar date — hand it straight to the input. Routing
       * it through `new Date()` would read it as UTC midnight and then format
       * it in local time, showing the previous day to everyone west of UTC
       * (AGENTS.md: never derive a local calendar date from a UTC instant).
       * Re-picking the shown date would then write a value that differs from
       * the stored one, marking an untouched form dirty.
       */
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

      try {
        const date = new Date(raw);
        if (isNaN(date.getTime())) return '';

        return format(date, 'yyyy-MM-dd');
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
