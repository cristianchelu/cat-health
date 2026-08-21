import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import './FormActions.css';

interface FormActionsProps extends React.ComponentProps<'div'> {
  onCancel: () => void;
  cancelLabel: string;
  submitLabel: string;
  isSubmitting?: boolean;
  submitDisabled?: boolean;
  cancelDisabled?: boolean;
  submitVariant?: ButtonProps['variant'];
  cancelVariant?: ButtonProps['variant'];
  submitType?: 'submit' | 'button';
  onSubmitClick?: () => void;
  /**
   * The far end of the row, opposite Cancel/Save: the page's destructive action
   * (`danger`, opening a `ConfirmDialog`), or state about the pending commit
   * ("2 new selected", a validation count). Never a second commit, and never
   * navigation — page and step back are the `AppHeaderBar` back control.
   */
  leading?: React.ReactNode;
}

/*
 * The one commit row. It belongs to the form, not to a card, and there is
 * exactly one per screen — after the last card, in the page column.
 *
 * Cancel is `neutral` (surface + hairline) rather than a second fill: with the
 * primary next to it, two filled buttons read as two commits. That leaves one
 * meaning per fill — indigo `primary` commits, teal `secondary` is a card-local
 * tool that touches neither the form nor the server, and a fill anywhere always
 * means something happens.
 *
 * Navigation is not a form action: page back and step back are the
 * `AppHeaderBar` back control, so the row never grows a Back button.
 *
 * A destructive takes the `leading` slot, as far from the commit as the row is
 * wide. Stacked on a phone that width is gone, so `FormShell.css` buys the
 * distance back in vertical space.
 */
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
      cancelVariant = 'neutral',
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
            variant={cancelVariant}
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
