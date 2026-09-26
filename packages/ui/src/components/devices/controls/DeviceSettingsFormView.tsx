import * as React from 'react';
import { DiscardUnsavedDialog } from '@/components/ui/DiscardUnsavedDialog';
import {
  FormCard,
  FormCardBody,
  FormCardHead,
  FormShell,
} from '@/components/ui/form';
import type { ControlValueType } from 'shared';
import type { ControlDraftValue } from '@/lib/deviceControlDraft';
import { cn } from '@/lib/utils';
import { ControlField } from './ControlField';
import './DeviceSettingsFormView.css';

interface DeviceSettingsFormField {
  key: string;
  label: string;
  type: ControlValueType;
  value: ControlDraftValue;
  status?: string;
  error?: string;
}

interface DeviceSettingsFormViewProps {
  fields: DeviceSettingsFormField[];
  onFieldChange: (key: string, value: ControlDraftValue) => void;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  onCancel: () => void;
  isDirty: boolean;
  isSaving: boolean;
  error: string | null;
  discardConfirm: React.ComponentProps<typeof DiscardUnsavedDialog>;
  copy: { title: string; save: string; cancel: string };
  className?: string;
}

/** A device's settings on one card, committed by the form's one Save row. */
const DeviceSettingsFormView: React.FC<DeviceSettingsFormViewProps> = ({
  fields,
  onFieldChange,
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
      <FormCard>
        <FormCardHead title={copy.title} />
        <FormCardBody>
          {fields.map((field) => (
            <ControlField
              key={field.key}
              label={field.label}
              type={field.type}
              value={field.value}
              onChange={(value) => onFieldChange(field.key, value)}
              disabled={isSaving}
              status={field.status}
              error={field.error}
            />
          ))}
        </FormCardBody>
      </FormCard>
    </FormShell>
    <DiscardUnsavedDialog {...discardConfirm} />
  </>
);

export {
  DeviceSettingsFormView,
  type DeviceSettingsFormField,
  type DeviceSettingsFormViewProps,
};
