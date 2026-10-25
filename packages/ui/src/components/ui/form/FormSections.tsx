import * as React from 'react';
import { cn } from '@/lib/utils';
import './FormSections.css';

type FormSectionsProps = React.ComponentProps<'div'>;

/** The column a form's sections stack in; it owns the gap between them. */
const FormSections = React.forwardRef<HTMLDivElement, FormSectionsProps>(
  ({ className, children, ...props }, ref) => (
    <div className={cn('form-sections', className)} ref={ref} {...props}>
      {children}
    </div>
  ),
);

FormSections.displayName = 'FormSections';

export { FormSections, type FormSectionsProps };
