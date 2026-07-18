import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import './FormShell.css';

interface FormActionsProps extends React.ComponentProps<'div'> {
  onCancel: () => void;
  cancelLabel: string;
  submitLabel: string;
  isSubmitting?: boolean;
  submitDisabled?: boolean;
  cancelDisabled?: boolean;
  submitVariant?: ButtonProps['variant'];
  submitType?: 'submit' | 'button';
  onSubmitClick?: () => void;
  /** Optional leading control (e.g. Delete) — sits opposite Cancel/Save. */
  leading?: React.ReactNode;
}

const FormActions = React.forwardRef<HTMLDivElement, FormActionsProps>(
  (
    {
      className,
      onCancel,
      cancelLabel,
      submitLabel,
      isSubmitting = false,
      submitDisabled = false,
      cancelDisabled = false,
      submitVariant = 'primary',
      submitType = 'submit',
      onSubmitClick,
      leading,
      ...props
    },
    ref,
  ) => {
    return (
      <div
        className={cn(
          'form-actions',
          leading != null && 'form-actions--with-leading',
          className,
        )}
        ref={ref}
        {...props}
      >
        {leading}
        <div className="form-actions__end">
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={cancelDisabled || isSubmitting}
          >
            {cancelLabel}
          </Button>
          <Button
            type={submitType}
            variant={submitVariant}
            disabled={submitDisabled || isSubmitting}
            onClick={onSubmitClick}
            aria-busy={isSubmitting || undefined}
          >
            {isSubmitting ? (
              <Loader2 className="animate-spin" size="1em" aria-hidden />
            ) : null}
            {submitLabel}
          </Button>
        </div>
      </div>
    );
  },
);

FormActions.displayName = 'FormActions';

export { FormActions, type FormActionsProps };
