import * as React from 'react';
import { cn } from '@/lib/utils';
import './FallbackImage.css';

interface FallbackImageProps extends Omit<
  React.ComponentProps<'div'>,
  'children'
> {
  /** Image source. When missing or unloadable, `fallback` is shown instead. */
  src?: string;
  alt: string;
  /** Centered content when there is no usable image (icon, initials, etc.). */
  fallback: React.ReactNode;
  imgClassName?: string;
  fallbackClassName?: string;
  onLoad?: React.ReactEventHandler<HTMLImageElement>;
  onError?: React.ReactEventHandler<HTMLImageElement>;
}

/**
 * Fills its parent with an object-fit cover image, or a centered fallback when
 * `src` is missing or the browser cannot load it — never the UA broken-image glyph.
 */
const FallbackImage = React.forwardRef<HTMLDivElement, FallbackImageProps>(
  (
    {
      src,
      alt,
      fallback,
      className,
      imgClassName,
      fallbackClassName,
      onLoad,
      onError,
      ...props
    },
    ref,
  ) => {
    const [failed, setFailed] = React.useState(false);
    const [loaded, setLoaded] = React.useState(false);

    // Render-time reset so a new src never paints one frame with the
    // previous image's failed/loaded state.
    const [prevSrc, setPrevSrc] = React.useState(src);
    if (prevSrc !== src) {
      setPrevSrc(src);
      setFailed(false);
      setLoaded(false);
    }

    const showImage = Boolean(src) && !failed;
    // Keep the fallback off while a fetch is in flight so refreshes don't
    // flash the empty-state icon over the parent's own placeholder surface.
    const showFallback = !showImage;

    return (
      <div ref={ref} className={cn('fallback-image', className)} {...props}>
        {showImage && (
          <img
            src={src}
            alt={alt}
            className={cn(
              'fallback-image-img',
              loaded && 'is-ready',
              imgClassName,
            )}
            onLoad={(event) => {
              setLoaded(true);
              onLoad?.(event);
            }}
            onError={(event) => {
              setFailed(true);
              setLoaded(false);
              onError?.(event);
            }}
          />
        )}
        {showFallback && (
          <div className={cn('fallback-image-fallback', fallbackClassName)}>
            {fallback}
          </div>
        )}
      </div>
    );
  },
);

FallbackImage.displayName = 'FallbackImage';

export { FallbackImage, type FallbackImageProps };
export default FallbackImage;
