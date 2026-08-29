import * as React from 'react';
import { Drawer } from 'vaul';

import { useIsPhone } from '@/hooks/useIsPhone';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent } from './Dialog';
import './Sheet.css';

/* vaul's exit animation is a hardcoded 0.5s; the latch outlives it slightly. */
const SHEET_EXIT_MS = 600;

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Phone only: gates the user-initiated dismissals vaul owns (drag down,
   * scrim tap, Escape). Setting `open={false}` always closes. Desktop
   * dismissals still route through `onOpenChange` as today, so a host that
   * needs a guard keeps it in its `onOpenChange` handler for desktop and
   * passes `dismissible` for phone.
   */
  dismissible?: boolean;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  /** Lands on the padded content box — the node consumer CSS already targets. */
  className?: string;
  children: React.ReactNode;
}

/**
 * A drawer on a phone, the centered dialog on everything else.
 *
 * The two are one component because they are one surface: the same content,
 * the same close semantics, the same host state. What differs is only how it
 * arrives — docked to the thumb with a grabber and a drag to dismiss, or
 * floating in the middle of a desktop window.
 *
 * The phone half is `vaul`, which owns the gesture, the rubber band and the
 * enter/exit animation; we own where it sits and what it looks like, since
 * vaul ships no positioning CSS of its own.
 */
export const Sheet: React.FC<SheetProps> = ({
  open,
  onOpenChange,
  dismissible,
  onEscapeKeyDown,
  className,
  children,
}) => {
  const isPhone = useIsPhone();

  /*
   * The exit animation plays on a drawer that is already `open={false}`, so
   * the tree has to outlive the close by the length of it. Unmounting the Root
   * afterwards is also what guarantees vaul's body scroll-lock is released
   * (#656) rather than trusting it to clean up in place.
   */
  const [mounted, setMounted] = React.useState(open);
  React.useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    if (!mounted) return;
    const timer = window.setTimeout(() => setMounted(false), SHEET_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [open, mounted]);

  if (!isPhone) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className={className}
          showCloseButton={false}
          onEscapeKeyDown={onEscapeKeyDown}
        >
          {children}
        </DialogContent>
      </Dialog>
    );
  }

  if (!open && !mounted) return null;

  return (
    <Drawer.Root
      open={open}
      onOpenChange={onOpenChange}
      dismissible={dismissible}
      autoFocus
      repositionInputs
    >
      <Drawer.Portal>
        <Drawer.Overlay className="sheet-overlay" />
        <Drawer.Content
          className="sheet-content"
          onEscapeKeyDown={onEscapeKeyDown}
        >
          {/* `preventCycle`: there are no snap points to cycle through, and
              the tap-cycle path closes a non-dismissible drawer. */}
          <Drawer.Handle className="sheet-handle" preventCycle />
          <div className={cn('sheet-inner', className)}>{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
};

export default Sheet;
