import * as React from 'react';
import { cn } from '@/lib/utils';
import './MetaLine.css';

interface MetaLineProps extends React.ComponentProps<'span'> {
  /** Falsy parts are dropped, so callers can pass conditionals straight in. */
  parts: ReadonlyArray<string | null | undefined>;
}

/**
 * A row's secondary line: short facts separated by a dot.
 *
 * Inline by construction — it renders inside a card row's description
 * paragraph, so every element here has to be phrasing content.
 *
 * The dots are decorative and hidden from assistive tech: a screen reader
 * announcing "bullet" between every fact adds nothing to "Feeder, PetKit".
 */
const MetaLine = React.forwardRef<HTMLSpanElement, MetaLineProps>(
  ({ parts, className, ...props }, ref) => {
    const visible = parts.filter((part): part is string => Boolean(part));
    if (visible.length === 0) {
      return null;
    }

    return (
      <span className={cn('meta-line', className)} ref={ref} {...props}>
        {visible.map((part, index) => (
          /*
           * Keyed by position, not content: two parts can legitimately read the
           * same — a camera from the built-in "Camera" provider — and that must
           * not collapse into one key.
           */
          <React.Fragment key={index}>
            {index > 0 && <span className="meta-line-sep" aria-hidden="true" />}
            <span>{part}</span>
          </React.Fragment>
        ))}
      </span>
    );
  },
);

MetaLine.displayName = 'MetaLine';

export { MetaLine, type MetaLineProps };
