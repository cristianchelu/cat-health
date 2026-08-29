import * as React from 'react';
import { Select as SelectPrimitive } from 'radix-ui';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import './SelectMenu.css';

/**
 * A listbox whose options can carry a picture and a second line.
 *
 * **Use the native `<select>` from `ui/form` unless an option needs a picture
 * or a subtitle.** That is the whole rule. A plain list of text options is
 * better served by the platform control: it gets the OS wheel on a phone, the
 * OS dropdown on a desktop, form autofill, and zero JavaScript. Reach for this
 * one only when an option is a *thing with a face* — a cat with its photo and
 * its recent weight range, a device with its brand mark and its room — because
 * `<option>` may hold text and nothing else.
 *
 * Every string here is the caller's — the component ships no copy of its own,
 * so translate at the call site as you would for the native control.
 *
 * ```tsx
 * <SelectMenu value={petId} onValueChange={setPetId}>
 *   <SelectMenuTrigger aria-label={pickLabel}>
 *     <SelectMenuValue placeholder={pickLabel} />
 *   </SelectMenuTrigger>
 *   <SelectMenuContent>
 *     <SelectMenuGroup>
 *       <SelectMenuLabel>{householdLabel}</SelectMenuLabel>
 *       <SelectMenuItem
 *         value="1"
 *         leading={<Avatar src={luna.photo} alt="" size="sm" />}
 *         subline="4.1–4.4 kg"
 *       >
 *         Luna
 *       </SelectMenuItem>
 *     </SelectMenuGroup>
 *   </SelectMenuContent>
 * </SelectMenu>
 * ```
 *
 * Named `SelectMenu` rather than `Select` because `ui/form/Select` is the
 * native control and keeps that name — the plain one should read as the
 * default, and this as the thing you escalate to.
 */
const SelectMenu = SelectPrimitive.Root;

/**
 * A section of the list. Pair with {@link SelectMenuLabel}, which Radix wires
 * up as the group's accessible name.
 */
const SelectMenuGroup = SelectPrimitive.Group;

/**
 * The chosen option's label, in the trigger.
 *
 * Radix clones the selected {@link SelectMenuItem}'s *label* here — not its
 * avatar and not its subline, both of which live outside the item's text node.
 * A trigger that should echo the picture passes it to the trigger's own
 * `leading` prop, so that the trigger stays one line however rich the list is.
 */
const SelectMenuValue = SelectPrimitive.Value;

const SelectMenuTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> & {
    /** Mirrors the chosen option's avatar or icon. See {@link SelectMenuValue}. */
    leading?: React.ReactNode;
    /** Matches `ui/form/Select`, so the two sit level in the same form row. */
    variant?: 'default' | 'error';
    inputSize?: 'sm' | 'md' | 'lg';
  }
>(
  (
    {
      className,
      children,
      leading,
      variant = 'default',
      inputSize = 'md',
      ...props
    },
    ref,
  ) => (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn('select-menu-trigger', variant, inputSize, className)}
      {...props}
    >
      {leading != null && (
        <span className="select-menu-trigger-leading" aria-hidden="true">
          {leading}
        </span>
      )}
      <span className="select-menu-trigger-value">{children}</span>
      <SelectPrimitive.Icon className="select-menu-trigger-icon">
        <ChevronDown size={16} aria-hidden="true" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  ),
);
SelectMenuTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectMenuContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(
  (
    {
      className,
      children,
      /*
       * `popper` rather than Radix's default `item-aligned`: item-aligned drags
       * the chosen row up under the cursor the way the macOS menu does, which
       * for rows two lines tall means the list lands somewhere different for
       * every value. A dropdown that opens below its trigger every time is the
       * behaviour the rest of the family already has.
       */
      position = 'popper',
      sideOffset = 6,
      collisionPadding = 8,
      ...props
    },
    ref,
  ) => (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        position={position}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn('select-menu-content', className)}
        {...props}
      >
        <SelectPrimitive.ScrollUpButton className="select-menu-scroll">
          <ChevronUp size={14} aria-hidden="true" />
        </SelectPrimitive.ScrollUpButton>
        <SelectPrimitive.Viewport className="select-menu-viewport">
          {children}
        </SelectPrimitive.Viewport>
        <SelectPrimitive.ScrollDownButton className="select-menu-scroll">
          <ChevronDown size={14} aria-hidden="true" />
        </SelectPrimitive.ScrollDownButton>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  ),
);
SelectMenuContent.displayName = SelectPrimitive.Content.displayName;

/** The heading of a {@link SelectMenuGroup}. Not selectable, not focusable. */
const SelectMenuLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn('select-menu-label', className)}
    {...props}
  />
));
SelectMenuLabel.displayName = SelectPrimitive.Label.displayName;

const SelectMenuItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item> & {
    /** An avatar or icon at the head of the row. Decorative — the label names the option. */
    leading?: React.ReactNode;
    /** A quiet second line: a weight range, a room, a last-seen time. */
    subline?: React.ReactNode;
  }
>(
  (
    {
      className,
      children,
      leading,
      subline,
      'aria-describedby': describedBy,
      ...props
    },
    ref,
  ) => {
    /*
     * Radix points the item's `aria-labelledby` at its `ItemText` and nothing
     * else, so a subline rendered as a plain sibling is drawn on screen and
     * announced to nobody. It is the option's *description*, not part of its
     * name — "Luna, 4.1 to 4.4 kilograms" — so it is wired up as one, and a
     * caller's own `aria-describedby` is kept rather than overwritten.
     */
    const id = React.useId();
    const sublineId = subline != null ? `${id}-subline` : undefined;
    const describedByIds =
      [describedBy, sublineId].filter(Boolean).join(' ') || undefined;

    return (
      <SelectPrimitive.Item
        ref={ref}
        className={cn('select-menu-item', className)}
        aria-describedby={describedByIds}
        {...props}
      >
        {leading != null && (
          <span className="select-menu-item-leading" aria-hidden="true">
            {leading}
          </span>
        )}
        <span className="select-menu-item-body">
          {/*
           * Only the label goes inside `ItemText`: that node is what Radix clones
           * into the trigger, and what typeahead matches against. A subline in here
           * would put "4.1–4.4 kg" in the closed control and make `lu` stop
           * matching Luna. Pass `textValue` when the label is not a plain string.
           */}
          <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
          {subline != null && (
            <span className="select-menu-item-subline" id={sublineId}>
              {subline}
            </span>
          )}
        </span>
        {/*
         * The slot is always rendered even though Radix only fills it when the
         * option is the chosen one: an indicator that appears and disappears
         * would shift every label sideways as the selection moves down.
         */}
        <span className="select-menu-item-check">
          <SelectPrimitive.ItemIndicator>
            <Check size={16} aria-hidden="true" />
          </SelectPrimitive.ItemIndicator>
        </span>
      </SelectPrimitive.Item>
    );
  },
);
SelectMenuItem.displayName = SelectPrimitive.Item.displayName;

const SelectMenuSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn('select-menu-separator', className)}
    {...props}
  />
));
SelectMenuSeparator.displayName = SelectPrimitive.Separator.displayName;

export {
  SelectMenu,
  SelectMenuTrigger,
  SelectMenuValue,
  SelectMenuContent,
  SelectMenuGroup,
  SelectMenuLabel,
  SelectMenuItem,
  SelectMenuSeparator,
};
