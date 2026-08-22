import * as React from 'react';
import { cn } from '@/lib/utils';

import './SplitIcon.css';

export interface SplitIconHalf {
  icon: React.ElementType;
  /** A CSS colour or token reference. Tints the half and inks its glyph. */
  color: string;
}

export interface SplitIconProps extends React.ComponentProps<'span'> {
  halves: [SplitIconHalf, SplitIconHalf];
}

/**
 * One icon slot showing two things at once, split down the middle.
 *
 * For a kind that is genuinely two kinds — a litterbox visit that was both a
 * urination and a defecation — where picking one of the two would drop half
 * the fact, and inventing a third colour to stand for the pair would say
 * neither. Each half carries its own tint and its own glyph, so the slot needs
 * no accent of its own.
 *
 * It paints the whole slot, tint included, rather than asking its container
 * for a two-tone background. That is what keeps this a pattern rather than an
 * escape hatch: anywhere a single icon fits, this fits, and nothing upstream
 * has to know it might be handed a gradient.
 *
 * The split is vertical because a 45° seam on a 32px circle reads as a texture
 * rather than as a division, and each glyph is centred in its own half rather
 * than shoulder to shoulder — the half is the space it has, so the middle of
 * the half is where it belongs and how it gets to stay legible.
 */
const SplitIcon = React.forwardRef<HTMLSpanElement, SplitIconProps>(
  ({ halves, className, ...props }, ref) => {
    return (
      <span
        className={cn('split-icon', className)}
        ref={ref}
        aria-hidden
        {...props}
      >
        {halves.map(({ icon: Icon, color }, index) => (
          <span
            className="split-icon-half"
            key={index}
            style={{ '--split-icon-hue': color } as React.CSSProperties}
          >
            <Icon />
          </span>
        ))}
      </span>
    );
  },
);

SplitIcon.displayName = 'SplitIcon';

export { SplitIcon };
export default SplitIcon;
