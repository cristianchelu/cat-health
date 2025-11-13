import * as React from 'react';
import { cn } from '@/lib/utils';
import './Input.css';

interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  variant?: 'default' | 'error';
  inputSize?: 'sm' | 'md' | 'lg';
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      variant = 'default',
      inputSize = 'md',
      type = 'text',
      ...props
    },
    ref,
  ) => {
    return (
      <input
        type={type}
        className={cn('input', variant, inputSize, className)}
        ref={ref}
        {...props}
      />
    );
  },
);

Input.displayName = 'Input';

export { Input, type InputProps };
