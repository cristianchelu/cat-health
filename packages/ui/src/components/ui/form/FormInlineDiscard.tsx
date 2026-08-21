import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { FormActions } from './FormActions';
import './FormInlineDiscard.css';

interface FormInlineDiscardProps extends React.ComponentProps<'div'> {
  /** Short prompt; omit for buttons-only (quiet UI). */
  message?: string;
  keepLabel: string;
  discardLabel: string;
  onKeepEditing: () => void;
  onDiscard: () => void;
  disabled?: boolean;
}

/**
 * The discard confirm for a dirty modal, asked in the modal's own footer.
 *
 * A modal cannot ask with a second `Dialog`: stacking one over the form traps
 * focus in the wrong surface and leaves the user two scrims to unwind. The
 * commit row asks instead — the same row in the same place, with Keep editing
 * where Cancel was and a `danger` Discard where the commit was, so the answer
 * lands under the pointer that opened the question.
 *
 * A preset over `FormActions`, not a row of its own: the geometry, the stack
 * and the one-fill rule are the row's, and there is no reason for the confirm
 * to drift from them.
 */
const FormInlineDiscard = React.forwardRef<
  HTMLDivElement,
  FormInlineDiscardProps
>(
  (
    {
      className,
      message,
      keepLabel,
      discardLabel,
      onKeepEditing,
      onDiscard,
      disabled = false,
      ...props
    },
    ref,
  ) => {
    const { t } = useTranslation();

    return (
      <FormActions
        className={cn('form-inline-discard', className)}
        ref={ref}
        role="group"
        aria-label={message ?? t('common.discard_unsaved_title')}
        leading={
          message ? (
            <p className="form-inline-discard__message">{message}</p>
          ) : undefined
        }
        onCancel={onKeepEditing}
        cancelLabel={keepLabel}
        cancelDisabled={disabled}
        submitLabel={discardLabel}
        submitVariant="danger"
        submitType="button"
        onSubmitClick={onDiscard}
        submitDisabled={disabled}
        {...props}
      />
    );
  },
);

FormInlineDiscard.displayName = 'FormInlineDiscard';

export { FormInlineDiscard, type FormInlineDiscardProps };
