import * as React from 'react';
import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import './DropdownMenu.css';

const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

/**
 * The overflow menu: the actions a surface has but does not want to spend
 * header room on.
 *
 * One of the three anchored surfaces, beside {@link Popover} and
 * {@link SelectMenu}; they wear the same skin and are told apart by what they
 * hold. This one holds *commands* — pressing a row does something and closes
 * the menu. A row that sets a value belongs in `SelectMenu`, and anything that
 * is not a list of rows belongs in `Popover`.
 *
 * Deliberately thin — placement, dismissal and roving focus are the
 * primitive's job. What this file owns is the app's menu skin.
 */
const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(
  (
    {
      className,
      align = 'end',
      sideOffset = 6,
      collisionPadding = 8,
      ...props
    },
    ref,
  ) => (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn('dropdown-menu', className)}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  ),
);
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

/**
 * A row of the menu.
 *
 * Every row is a command, so none of them announce where they go — except one
 * that goes somewhere: `opensPage` marks a row that walks you onto another
 * surface rather than doing something and closing. The chevron is the whole
 * announcement, which is why it is a flag here and not a caller's icon.
 */
const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    tone?: 'default' | 'danger';
    opensPage?: boolean;
  }
>(({ className, tone = 'default', opensPage, children, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn('dropdown-menu-item', tone, className)}
    {...props}
  >
    {children}
    {opensPage && (
      <ChevronRight className="dropdown-menu-item-chevron" aria-hidden />
    )}
  </DropdownMenuPrimitive.Item>
));
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn('dropdown-menu-separator', className)}
    {...props}
  />
));
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName;

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
};
