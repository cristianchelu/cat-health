import * as React from 'react';
import { cn } from '@/lib/utils';
import './Textarea.css';

interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  variant?: 'default' | 'error';
  inputSize?: 'sm' | 'md' | 'lg';
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, variant = 'default', inputSize = 'md', ...props }, ref) => {
    return (
      <textarea
        className={cn('textarea', variant, inputSize, className)}
        ref={ref}
        {...props}
      />
    );
  },
);

Textarea.displayName = 'Textarea';

export { Textarea, type TextareaProps };
