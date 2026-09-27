import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { FormError, FormField, Input } from '@/components/ui/form';
import './ProcedureWizardDialog.css';

interface ProcedureWizardInput {
  key: string;
  label: string;
  value: string;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
}

interface ProcedureWizardDialogProps {
  open: boolean;
  title: string;
  /** Where the person is, e.g. "Step 1 of 2". */
  progress: string;
  instruction: string;
  inputs: ProcedureWizardInput[];
  onInputChange: (key: string, value: string) => void;
  error?: string;
  /** Set while the step runs; the dialog cannot be dismissed then. */
  busy: boolean;
  cancelLabel: string;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: () => void;
}

/** One step of a device procedure: what to do, what it needs, and go. */
const ProcedureWizardDialog: React.FC<ProcedureWizardDialogProps> = ({
  open,
  title,
  progress,
  instruction,
  inputs,
  onInputChange,
  error,
  busy,
  cancelLabel,
  submitLabel,
  onCancel,
  onSubmit,
}) => {
  const id = React.useId();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onCancel();
      }}
    >
      <DialogContent
        className="procedure-wizard-dialog"
        showCloseButton={false}
        onPointerDownOutside={(event) => {
          if (busy) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{progress}</DialogDescription>
        </DialogHeader>
        <form
          className="procedure-wizard-dialog-body"
          id={`${id}-form`}
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy) onSubmit();
          }}
        >
          <p className="procedure-wizard-dialog-instruction">{instruction}</p>
          {inputs.map((input) => (
            <FormField
              key={input.key}
              label={input.label}
              htmlFor={`${id}-${input.key}`}
            >
              <span className="procedure-wizard-dialog-number">
                <Input
                  id={`${id}-${input.key}`}
                  className="procedure-wizard-dialog-input"
                  type="number"
                  inputMode="decimal"
                  value={input.value}
                  min={input.min}
                  max={input.max}
                  step={input.step ?? 'any'}
                  onChange={(event) =>
                    onInputChange(input.key, event.target.value)
                  }
                  disabled={busy}
                />
                {input.unit ? (
                  <span className="procedure-wizard-dialog-unit">
                    {input.unit}
                  </span>
                ) : null}
              </span>
            </FormField>
          ))}
          {error ? <FormError>{error}</FormError> : null}
        </form>
        <DialogFooter>
          <Button
            type="button"
            variant="neutral"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </Button>
          <Button
            type="submit"
            form={`${id}-form`}
            variant="primary"
            disabled={busy}
          >
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export {
  ProcedureWizardDialog,
  type ProcedureWizardDialogProps,
  type ProcedureWizardInput,
};
