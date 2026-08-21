import * as React from 'react';
import { Check, ImageOff } from 'lucide-react';
import { Spinner } from './Spinner';
import { cn } from '@/lib/utils';
import { FallbackImage } from './FallbackImage';
import './MediaTile.css';

type MediaTileFooterTone = 'neutral' | 'ok' | 'error';

interface MediaTileProps {
  src?: string;
  alt: string;
  /** Chosen, and marked with a check. */
  selected?: boolean;
  /** Something is running against this tile: it dims and stops responding. */
  busy?: boolean;
  /** A verdict or caption pinned across the bottom of the tile. */
  footer?: React.ReactNode;
  footerTone?: MediaTileFooterTone;
  /** Shown when there is no usable image. */
  fallback?: React.ReactNode;
  /** Omit for a tile that only displays; it then renders as plain content. */
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

/**
 * One square of media, and whatever the surface needs to say about it.
 *
 * A tile with an `onClick` is a real `<button>`, not a clickable `<div>` —
 * every grid that hand-rolled this used the latter, so none of them could be
 * operated from a keyboard.
 *
 * `busy` disables rather than only dimming: it means a request is already in
 * flight against this tile, and a second click would race it.
 */
const MediaTile = React.forwardRef<HTMLButtonElement, MediaTileProps>(
  (
    {
      src,
      alt,
      selected,
      busy,
      footer,
      footerTone = 'neutral',
      fallback,
      onClick,
      disabled,
      className,
    },
    ref,
  ) => {
    const content = (
      <>
        <FallbackImage
          className="media-tile-image"
          src={src}
          alt={alt}
          fallback={fallback ?? <ImageOff size={20} aria-hidden="true" />}
        />
        {busy && (
          <span className="media-tile-busy">
            <Spinner size={24} />
          </span>
        )}
        {selected && (
          <span className="media-tile-check" aria-hidden="true">
            <Check size={20} />
          </span>
        )}
        {footer != null && (
          <span className={cn('media-tile-footer', footerTone)}>{footer}</span>
        )}
      </>
    );

    const classes = cn(
      'media-tile',
      selected && 'selected',
      busy && 'busy',
      className,
    );

    if (!onClick) {
      return <span className={cn(classes, 'static')}>{content}</span>;
    }

    return (
      <button
        className={classes}
        ref={ref}
        type="button"
        onClick={onClick}
        disabled={disabled || busy}
        aria-pressed={selected}
      >
        {content}
      </button>
    );
  },
);

MediaTile.displayName = 'MediaTile';

export { MediaTile, type MediaTileProps, type MediaTileFooterTone };
