import * as React from 'react';
import { cn } from '@/lib/utils';
import './FormCard.css';

type FormCardProps = React.ComponentProps<'div'>;

/**
 * Surface an add/edit form sits on: one card holding a header and the
 * `FormShell`.
 *
 * Shared by the provider and device screens so no form reads as a stack of
 * fields floating on the page background.
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

export { FormCard, FormCardHead, type FormCardProps, type FormCardHeadProps };
