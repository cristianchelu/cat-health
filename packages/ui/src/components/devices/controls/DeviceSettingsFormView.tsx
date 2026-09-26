import * as React from 'react';
import { DiscardUnsavedDialog } from '@/components/ui/DiscardUnsavedDialog';
import { FormShell } from '@/components/ui/form';
import { cn } from '@/lib/utils';
import './DeviceSettingsFormView.css';

interface DeviceSettingsFormViewProps {
  /** The settings themselves, drawn by `DeviceSettingsSections`. */
  grid: React.ReactNode;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  onCancel: () => void;
  isDirty: boolean;
  isSaving: boolean;
  error: string | null;
  discardConfirm: React.ComponentProps<typeof DiscardUnsavedDialog>;
  copy: { save: string; cancel: string };
  className?: string;
}

/** A device's settings as tiles, committed by the form's one Save row. */
const DeviceSettingsFormView: React.FC<DeviceSettingsFormViewProps> = ({
  grid,
  onSubmit,
  onCancel,
  isDirty,
  isSaving,
  error,
  discardConfirm,
  copy,
  className,
}) => (
  <>
    <FormShell
      className={cn('device-settings-form-view', className)}
      onSubmit={onSubmit}
      error={error}
      actions={{
        onCancel,
        cancelLabel: copy.cancel,
        submitLabel: copy.save,
        isSubmitting: isSaving,
        submitDisabled: !isDirty,
        cancelDisabled: !isDirty,
      }}
    >
      {grid}
    </FormShell>
    <DiscardUnsavedDialog {...discardConfirm} />
  </>
);

export { DeviceSettingsFormView, type DeviceSettingsFormViewProps };
