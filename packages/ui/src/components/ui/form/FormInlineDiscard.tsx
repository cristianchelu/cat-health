import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import './FormShell.css';

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
 * In-dialog discard confirm — replaces FormActions. Do not nest a second Dialog.
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
      <div
        className={cn('form-actions', 'form-inline-discard', className)}
        ref={ref}
        role="group"
        aria-label={message ?? t('common.discard_unsaved_title')}
        {...props}
      >
        {message ? (
          <p className="form-inline-discard__message">{message}</p>
        ) : null}
        <div className="form-inline-discard__buttons">
          <Button
            type="button"
            variant="secondary"
            onClick={onKeepEditing}
            disabled={disabled}
          >
            {keepLabel}
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={onDiscard}
            disabled={disabled}
          >
            {discardLabel}
          </Button>
        </div>
      </div>
    );
  },
);

FormInlineDiscard.displayName = 'FormInlineDiscard';

export { FormInlineDiscard, type FormInlineDiscardProps };
