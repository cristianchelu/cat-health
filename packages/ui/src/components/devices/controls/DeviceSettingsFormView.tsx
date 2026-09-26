import * as React from 'react';
import { DiscardUnsavedDialog } from '@/components/ui/DiscardUnsavedDialog';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { FormShell } from '@/components/ui/form';
import type { ControlDraftValue } from '@/lib/deviceControlDraft';
import { cn } from '@/lib/utils';
import { ControlTileGrid } from './ControlTileGrid';
import type { ControlTileItem } from './ControlTiles';
import './DeviceSettingsFormView.css';

interface DeviceSettingsFormViewProps {
  items: ControlTileItem[];
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

/** A device's settings as tiles, committed by the form's one Save row. */
const DeviceSettingsFormView: React.FC<DeviceSettingsFormViewProps> = ({
  items,
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
      <SectionHeader>{copy.title}</SectionHeader>
      <ControlTileGrid items={items} onChange={onFieldChange} />
    </FormShell>
    <DiscardUnsavedDialog {...discardConfirm} />
  </>
);

export { DeviceSettingsFormView, type DeviceSettingsFormViewProps };
