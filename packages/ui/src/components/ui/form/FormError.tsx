import * as React from 'react';
import { cn } from '@/lib/utils';
import './FormShell.css';

interface FormErrorProps extends React.ComponentProps<'div'> {
  message?: string | null;
}

const FormError = React.forwardRef<HTMLDivElement, FormErrorProps>(
  ({ className, message, children, ...props }, ref) => {
    const content = message ?? children;
    if (!content) return null;

    return (
      <div
        className={cn('form-error', className)}
        ref={ref}
        role="alert"
        {...props}
      >
        {content}
      </div>
    );
  },
);

FormError.displayName = 'FormError';

export { FormError, type FormErrorProps };
