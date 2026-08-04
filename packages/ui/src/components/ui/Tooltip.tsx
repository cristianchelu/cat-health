import * as React from 'react';
import { Tooltip as TooltipPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';
import './Tooltip.css';

/**
 * A hover label for a glyph that cannot say its own value.
 *
 * Pointer and keyboard only, by design rather than by omission: a tooltip has
 * no touch gesture that is both discoverable and not already spoken for. Where
 * the exact figure matters on a phone, put it on the page in text.
 *
 * So this is an enhancement and never the only copy of anything. The trigger
 * must carry its value in an accessible name regardless — `content` here is
 * `aria-describedby`, which assistive tech may or may not announce.
 */
interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Preferred edge. Radix flips and shifts it to stay on screen. */
  side?: React.ComponentProps<typeof TooltipPrimitive.Content>['side'];
}

const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  className,
  side = 'top',
}) => (
  <TooltipPrimitive.Root>
    {/*
     * `asChild` so the trigger is whatever the caller passed. The device card
     * wraps its whole body in a link, and a nested button would be invalid
     * there — the glyphs have to stay non-interactive.
     */}
    <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        className={cn('tooltip-content', className)}
        side={side}
        sideOffset={6}
        collisionPadding={8}
      >
        {content}
        <TooltipPrimitive.Arrow className="tooltip-arrow" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  </TooltipPrimitive.Root>
);

/**
 * Wraps the app once. Shared so that moving between neighbouring glyphs shows
 * the second label immediately instead of waiting out the delay again — with a
 * provider per tooltip, a row of them feels broken.
 */
const TooltipProvider = TooltipPrimitive.Provider;

export { Tooltip, TooltipProvider, type TooltipProps };
