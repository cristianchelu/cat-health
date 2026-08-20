import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  children?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger';
  isConfirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  children,
  confirmLabel,
  cancelLabel,
  variant = 'default',
  isConfirming = false,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();

  if (!open) {
    return null;
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent
        className="confirm-dialog"
        showCloseButton={false}
        onPointerDownOutside={(event) => {
          if (isConfirming) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (isConfirming) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        {children}
        <DialogFooter>
          {/*
           * `neutral`, not the teal `secondary` fill: the confirm is the only
           * thing in here that does something, so it is the only fill.
           */}
          <Button
            type="button"
            variant="neutral"
            onClick={onCancel}
            disabled={isConfirming}
          >
            {cancelLabel ?? t('common.cancel')}
          </Button>
          <Button
            type="button"
            variant={variant === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            disabled={isConfirming}
          >
            {confirmLabel ?? t('common.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export { ConfirmDialog, type ConfirmDialogProps };
