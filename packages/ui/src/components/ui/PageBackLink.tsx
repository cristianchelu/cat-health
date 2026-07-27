import * as React from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import './PageBackLink.css';

interface PageBackLinkProps
  extends Omit<React.ComponentProps<'div'>, 'children'> {
  /**
   * Destination. Prefer an explicit route over history: arriving at a detail
   * page from a link, a reload, or a bookmark all leave `navigate(-1)` with
   * nowhere sensible to go.
   */
  to?: string;
  /** Go back through history instead. Implied when `to` and `onNavigate` are omitted. */
  useHistory?: boolean;
  /**
   * Handle going back yourself — for a wizard step, or anywhere leaving needs
   * to run a guard first. Takes precedence over `to` and `useHistory`.
   */
  onNavigate?: () => void;
  /** Desktop link text, and the accessible name of the mobile icon button. */
  label: string;
  /** Mobile title-bar text. Falls back to `label`. */
  mobileTitle?: React.ReactNode;
  /**
   * Element for the mobile title. Pass `'h1'` on pages whose own heading is
   * hidden at mobile width (see `DeviceHeader`), so exactly one heading stays
   * in the accessibility tree at every breakpoint. Leave as `'span'` when the
   * page renders a heading that is visible on mobile too — otherwise the page
   * ends up with two `<h1>`s.
   */
  mobileTitleAs?: 'span' | 'h1';
  /** Trailing controls. Rendered once, in both layouts. */
  actions?: React.ReactNode;
}

/**
 * Back affordance that reads as an inline "← Settings" link on desktop and as a
 * title bar with a round icon button on mobile.
 *
 * Both variants live in one flex row and are toggled with `display: none`, so
 * `actions` is never duplicated in the DOM and assistive tech only ever sees a
 * single back control.
 */
const PageBackLink = React.forwardRef<HTMLDivElement, PageBackLinkProps>(
  (
    {
      to,
      useHistory,
      onNavigate,
      label,
      mobileTitle,
      mobileTitleAs: MobileTitleTag = 'span',
      actions,
      className,
      ...props
    },
    ref,
  ) => {
    const navigate = useNavigate();
    const goBack = React.useCallback(() => {
      if (onNavigate) {
        onNavigate();
        return;
      }
      void navigate(-1);
    }, [navigate, onNavigate]);

    const asLink = to !== undefined && !onNavigate && !useHistory;

    const control = (
      controlClassName: string,
      children: React.ReactNode,
      ariaLabel?: string,
    ) =>
      asLink ? (
        <Link to={to} className={controlClassName} aria-label={ariaLabel}>
          {children}
        </Link>
      ) : (
        <button
          type="button"
          className={controlClassName}
          onClick={goBack}
          aria-label={ariaLabel}
        >
          {children}
        </button>
      );

    return (
      <div className={cn('page-back', className)} ref={ref} {...props}>
        {control(
          'page-back-link',
          <>
            <ArrowLeft size={16} aria-hidden="true" />
            <span>{label}</span>
          </>,
        )}
        {control(
          'page-back-iconbtn',
          <ArrowLeft size={18} aria-hidden="true" />,
          label,
        )}
        <MobileTitleTag className="page-back-title">
          {mobileTitle ?? label}
        </MobileTitleTag>
        {actions ? <div className="page-back-actions">{actions}</div> : null}
      </div>
    );
  },
);

PageBackLink.displayName = 'PageBackLink';

export { PageBackLink, type PageBackLinkProps };
