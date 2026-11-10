import * as React from 'react';

import { DialogTitle } from '@/components/ui/Dialog';
import { FormActions } from '@/components/ui/form/FormActions';
import { FormError } from '@/components/ui/form/FormError';
import { FormInlineDiscard } from '@/components/ui/form/FormInlineDiscard';
import { LabeledSwitchField } from '@/components/ui/form/LabeledSwitchField';
import { Sheet } from '@/components/ui/Sheet';

import './BandSheet.css';

interface BandSheetProps {
  open: boolean;
  /** Asked for by Cancel, the scrim, Escape or a drag; the host decides whether there is something to discard first. */
  onRequestClose: () => void;
  /** Whether closing loses nothing, so the phone drawer may be dragged away. */
  canDismiss: boolean;
  icon: React.ReactNode;
  title: string;
  tracked: boolean;
  onTrackedChange: (tracked: boolean) => void;
  trackedLabel: string;
  untrackedLabel: string;
  /** Accessible name of the Tracked switch. */
  trackSwitchLabel: string;
  /** The band's editor, drawn while it is tracked. */
  children: React.ReactNode;
  error: string | null;
  /** The discard question, asked in the footer in place of the commit row. */
  discard: { open: boolean; onConfirm: () => void; onCancel: () => void };
  keepLabel: string;
  discardLabel: string;
  cancelLabel: string;
  saveLabel: string;
  onSave: () => void;
  isSaving: boolean;
  saveDisabled: boolean;
}

/**
 * The sheet one band is edited in: its name and Tracked switch, the editor
 * while tracked, and the commit row, which turns into the discard question
 * when a dirty sheet is asked to close.
 */
const BandSheet: React.FC<BandSheetProps> = ({
  open,
  onRequestClose,
  canDismiss,
  icon,
  title,
  tracked,
  onTrackedChange,
  trackedLabel,
  untrackedLabel,
  trackSwitchLabel,
  children,
  error,
  discard,
  keepLabel,
  discardLabel,
  cancelLabel,
  saveLabel,
  onSave,
  isSaving,
  saveDisabled,
}) => (
  <Sheet
    open={open}
    onOpenChange={(next) => {
      if (!next) onRequestClose();
    }}
    dismissible={canDismiss}
    className="band-sheet"
  >
    <div className="band-sheet-head">
      <DialogTitle className="band-sheet-title">
        {icon}
        {title}
      </DialogTitle>
      <LabeledSwitchField
        checked={tracked}
        onCheckedChange={onTrackedChange}
        enabledLabel={trackedLabel}
        disabledLabel={untrackedLabel}
        aria-label={trackSwitchLabel}
      />
    </div>
    {tracked && children}
    <FormError message={error} />
    {discard.open ? (
      <FormInlineDiscard
        keepLabel={keepLabel}
        discardLabel={discardLabel}
        onKeepEditing={discard.onCancel}
        onDiscard={discard.onConfirm}
      />
    ) : (
      <FormActions
        onCancel={onRequestClose}
        cancelLabel={cancelLabel}
        submitLabel={saveLabel}
        isSubmitting={isSaving}
        submitDisabled={saveDisabled}
        submitType="button"
        onSubmitClick={onSave}
      />
    )}
  </Sheet>
);

export { BandSheet, type BandSheetProps };
