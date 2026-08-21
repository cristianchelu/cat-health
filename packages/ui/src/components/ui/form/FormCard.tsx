import * as React from 'react';
import { cn } from '@/lib/utils';
import './FormCard.css';

type FormCardProps = React.ComponentProps<'div'>;

/**
 * Surface an add/edit form sits on: one card holding a header and the fields.
 *
 * Shared by the provider and device screens so no form reads as a stack of
 * fields floating on the page background.
 *
 * The card holds content, not the commit. `FormShell` wraps the card rather
 * than sitting inside it, so its `FormActions` lands after the last card in the
 * page column — a Save row inside the card belongs to that card instead of to
 * the form, which stops working the moment a screen grows a second card.
 */
const FormCard = React.forwardRef<HTMLDivElement, FormCardProps>(
  ({ className, children, ...props }, ref) => (
    <div className={cn('form-card', className)} ref={ref} {...props}>
      {children}
    </div>
  ),
);

FormCard.displayName = 'FormCard';

interface FormCardHeadProps extends Omit<
  React.ComponentProps<'header'>,
  'title'
> {
  /** Decorative mark — a provider brand tile or a device type tile. */
  tile?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /**
   * Heading level for `title`. Every route now leads with an `AppHeaderBar`, so
   * the card is never the page heading and `h2` is the default; `h1` is left
   * reachable for a screen that has no app bar above it.
   */
  titleAs?: 'h1' | 'h2';
}

/**
 * Names what the form is editing. The tile is decorative, so the title must
 * always say in text what the mark says in colour.
 */
const FormCardHead = React.forwardRef<HTMLElement, FormCardHeadProps>(
  (
    { className, tile, title, subtitle, titleAs: Title = 'h2', ...props },
    ref,
  ) => (
    <header className={cn('form-card-head', className)} ref={ref} {...props}>
      {tile}
      <div className="form-card-head-text">
        <Title>{title}</Title>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
    </header>
  ),
);

FormCardHead.displayName = 'FormCardHead';

type FormCardBodyProps = React.ComponentProps<'div'>;

/**
 * The card's field stack, on the same `--space-md` rhythm as the page column:
 * `FormShell` spaces what it wraps, and it wraps the card, not the fields.
 */
const FormCardBody = React.forwardRef<HTMLDivElement, FormCardBodyProps>(
  ({ className, children, ...props }, ref) => (
    <div className={cn('form-card-body', className)} ref={ref} {...props}>
      {children}
    </div>
  ),
);

FormCardBody.displayName = 'FormCardBody';

export {
  FormCard,
  FormCardHead,
  FormCardBody,
  type FormCardProps,
  type FormCardHeadProps,
  type FormCardBodyProps,
};
