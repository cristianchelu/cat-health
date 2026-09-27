import * as React from 'react';
import { CircleAlert, CircleHelp } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/Popover';
import { cn } from '@/lib/utils';
import './TileNote.css';

interface TileNoteProps {
  /** `help` explains something about the tile; `error` says what went wrong. */
  tone: 'help' | 'error';
  /** Names the glyph and the panel it opens; for an error, the message itself. */
  label: string;
  body: React.ReactNode;
  /** A way to act on what the body says, such as a button to a settings page. */
  action?: React.ReactNode;
  className?: string;
}

/** How long the pointer rests on the glyph before the tip opens. */
const HOVER_OPEN_MS = 300;
/** How long the tip survives the pointer leaving, so it can be reached. */
const HOVER_CLOSE_MS = 200;

const canHover = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/**
 * A glyph in a tile's control row that says one thing. A tile is too small
 * for a sentence under its row, so what needs saying waits behind a mark: a
 * question for help, an exclamation for an error. The tip opens on hover
 * where there is a pointer to hover with, and on press everywhere; either
 * way it is the same words, with the action in reach.
 */
const TileNote: React.FC<TileNoteProps> = ({
  tone,
  label,
  body,
  action,
  className,
}) => {
  const [open, setOpen] = React.useState(false);
  // Whether the pointer opened it, in which case leaving closes it and a
  // press keeps it, rather than toggling it shut.
  const byHover = React.useRef(false);
  const timer = React.useRef<number | undefined>(undefined);
  const clearTimer = () => window.clearTimeout(timer.current);
  React.useEffect(() => clearTimer, []);

  const enter = () => {
    if (!canHover()) return;
    clearTimer();
    if (open) return;
    timer.current = window.setTimeout(() => {
      byHover.current = true;
      setOpen(true);
    }, HOVER_OPEN_MS);
  };
  const leave = () => {
    clearTimer();
    if (!byHover.current) return;
    timer.current = window.setTimeout(() => {
      byHover.current = false;
      setOpen(false);
    }, HOVER_CLOSE_MS);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        clearTimer();
        byHover.current = false;
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon
          className={cn('tile-note', tone, className)}
          aria-label={label}
          onPointerEnter={enter}
          onPointerLeave={leave}
          onClick={(event) => {
            if (open && byHover.current) {
              event.preventDefault();
              clearTimer();
              byHover.current = false;
            }
          }}
        >
          {tone === 'error' ? (
            <CircleAlert size={18} aria-hidden="true" />
          ) : (
            <CircleHelp size={18} aria-hidden="true" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        variant="tip"
        side="top"
        showArrow
        aria-label={label}
        onPointerEnter={clearTimer}
        onPointerLeave={leave}
        // A tip the pointer opened must not take the focus from where it was.
        onOpenAutoFocus={(event) => {
          if (byHover.current) event.preventDefault();
        }}
      >
        <span className="tile-note-body">{body}</span>
        {action ? <span className="tooltip-action">{action}</span> : null}
      </PopoverContent>
    </Popover>
  );
};

export { TileNote, type TileNoteProps };
