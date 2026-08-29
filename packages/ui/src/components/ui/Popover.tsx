import * as React from 'react';
import { Popover as PopoverPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';
import './Popover.css';

/**
 * An anchored surface: a small panel that belongs to the control that opened
 * it — view controls, a source note, a two-field form.
 *
 * The third member of the anchored family, beside {@link DropdownMenu} and
 * {@link SelectMenu}. Pick between them by what the surface *is*, not by how it
 * looks — all three wear the same skin:
 *
 * - a list of commands → `DropdownMenu` (roving focus, `menuitem` roles)
 * - a list you pick a value from → `SelectMenu` (`listbox`, one value out)
 * - anything else → `Popover` (a `dialog`; arbitrary content, tab order intact)
 *
 * Radix gives the content `role="dialog"` and no name of its own, so a popover
 * holding more than one control wants an `aria-label` or an `aria-labelledby`
 * pointing at its heading. A popover holding a single labelled field does not.
 *
 * Deliberately thin: placement, collision flipping, focus and dismissal are the
 * primitive's job. What this file owns is the app's skin.
 */
const Popover = PopoverPrimitive.Root;

const PopoverTrigger = PopoverPrimitive.Trigger;

/**
 * Anchors the surface to something other than the trigger — a table cell, a
 * chart point — for the cases where the thing you press and the thing you point
 * at are not the same element.
 */
const PopoverAnchor = PopoverPrimitive.Anchor;

/** Dismiss from inside, for a panel that commits (`Apply`, `Done`). */
const PopoverClose = PopoverPrimitive.Close;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & {
    /**
     * Draws the pointer at the anchor. Worth it when the popover explains one
     * specific thing on a busy surface; noise when it is a panel of controls,
     * which is why it is off by default.
     */
    showArrow?: boolean;
  }
>(
  (
    {
      className,
      children,
      showArrow = false,
      align = 'center',
      sideOffset = 6,
      collisionPadding = 8,
      ...props
    },
    ref,
  ) => (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn('popover', className)}
        {...props}
      >
        {children}
        {showArrow && <PopoverPrimitive.Arrow className="popover-arrow" />}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  ),
);
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverAnchor, PopoverContent, PopoverClose };
