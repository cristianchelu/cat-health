import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

interface DiscardUnsavedDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Preset discard-unsaved ConfirmDialog with shared i18n. */
const DiscardUnsavedDialog: React.FC<DiscardUnsavedDialogProps> = ({
  open,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();

  return (
    <ConfirmDialog
      open={open}
      title={t('common.discard_unsaved_title')}
      description={t('common.discard_unsaved_body')}
      confirmLabel={t('common.discard')}
      cancelLabel={t('common.cancel')}
      variant="danger"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
};

export { DiscardUnsavedDialog, type DiscardUnsavedDialogProps };
