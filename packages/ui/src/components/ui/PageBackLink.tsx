import * as React from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import './PageBackLink.css';

interface PageBackLinkProps {
  /**
   * Destination. Prefer an explicit route over history: arriving at a detail
   * page from a link, a reload, or a bookmark all leave `navigate(-1)` with
   * nowhere sensible to go.
   */
  to?: string;
  /** Go back through history instead. Implied when `to` is omitted. */
  useHistory?: boolean;
  /** Desktop link text, and the accessible name of the mobile icon button. */
  label: string;
  /** Mobile title-bar text. Falls back to `label`. */
  mobileTitle?: React.ReactNode;
  /** Trailing controls. Rendered once, in both layouts. */
  actions?: React.ReactNode;
  /** Stick the mobile bar to the top of the scroll container. */
  sticky?: boolean;
  className?: string;
}

/**
 * Back affordance that reads as an inline "← Settings" link on desktop and as a
 * title bar with a round icon button on mobile.
 *
 * Both variants live in one flex row and are toggled with `display: none`, so
 * `actions` is never duplicated in the DOM and assistive tech only ever sees a
 * single back control.
 */
const PageBackLink: React.FC<PageBackLinkProps> = ({
  to,
  useHistory,
  label,
  mobileTitle,
  actions,
  sticky = false,
  className,
}) => {
  const navigate = useNavigate();
  const goBack = React.useCallback(() => {
    void navigate(-1);
  }, [navigate]);

  const viaHistory = useHistory || to === undefined;

  const control = (
    controlClassName: string,
    children: React.ReactNode,
    ariaLabel?: string,
  ) =>
    viaHistory ? (
      <button
        type="button"
        className={controlClassName}
        onClick={goBack}
        aria-label={ariaLabel}
      >
        {children}
      </button>
    ) : (
      <Link to={to} className={controlClassName} aria-label={ariaLabel}>
        {children}
      </Link>
    );

  return (
    <div
      className={cn('page-back', sticky && 'page-back--sticky', className)}
    >
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
      <span className="page-back-title">{mobileTitle ?? label}</span>
      {actions ? <div className="page-back-actions">{actions}</div> : null}
    </div>
  );
};

export { PageBackLink, type PageBackLinkProps };
