import * as React from 'react';
import { cn } from '@/lib/utils';
import { FormActions, type FormActionsProps } from './FormActions';
import { FormError } from './FormError';
import './FormShell.css';

interface FormShellProps extends Omit<
  React.ComponentProps<'form'>,
  'onSubmit'
> {
  onSubmit?: React.FormEventHandler<HTMLFormElement>;
  error?: string | null;
  actions?: FormActionsProps;
  actionsSlot?: React.ReactNode;
}

const FormShell = React.forwardRef<HTMLFormElement, FormShellProps>(
  (
    { className, onSubmit, error, actions, actionsSlot, children, ...props },
    ref,
  ) => {
    return (
      <form
        className={cn('form-shell', className)}
        onSubmit={onSubmit}
        ref={ref}
        noValidate
        {...props}
      >
        {children}
        <FormError message={error} />
        {actionsSlot ?? (actions ? <FormActions {...actions} /> : null)}
      </form>
    );
  },
);

FormShell.displayName = 'FormShell';

export { FormShell, type FormShellProps };
