import * as React from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import './PageHeader.css';

interface PageHeaderBack {
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
  /** Where the control lands. Desktop link text, and the mobile button's name. */
  label: string;
}

interface PageHeaderProps
  extends Omit<React.ComponentProps<'header'>, 'title'> {
  /** Back affordance. Omit on a page that is its own root. */
  back?: PageHeaderBack;
  /** The page title — rendered as the page's one `<h1>`. */
  title?: React.ReactNode;
  /** Decorative mark beside the title. Hidden on mobile, where the row is tight. */
  icon?: React.ReactNode;
  /** Trailing controls. */
  actions?: React.ReactNode;
}

/**
 * The page's title bar, and the only place a page heading belongs.
 *
 * Desktop stacks it — "← Settings" on its own line, then the `<h1>` and any
 * actions below. Mobile folds the three into a single app-bar row, the back
 * link shrinking to a round icon button beside the title.
 *
 * That fold is done by moving one element between grid areas, not by mounting a
 * second copy of the heading. It has to be: a page whose mobile title bar is a
 * separate node from its desktop heading is a page where the two can say
 * different things, which is how `/settings/devices` came to read "← Settings"
 * on desktop and "← Devices" on mobile. One `<h1>`, one string, both widths.
 *
 * The back *control* is the one thing that does exist twice — a text link and
 * an icon button are different controls, not one control restyled. Both are
 * mounted and toggled with `display: none`, so assistive tech is only ever
 * offered the one its width applies to.
 */
const PageHeader = React.forwardRef<HTMLElement, PageHeaderProps>(
  ({ back, title, icon, actions, className, ...props }, ref) => {
    const navigate = useNavigate();
    const { to, useHistory, onNavigate, label } = back ?? {};

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
      <header className={cn('page-header', className)} ref={ref} {...props}>
        {back ? (
          <div className="page-header-back">
            {control(
              'page-header-back-link',
              <>
                <ArrowLeft size={16} aria-hidden="true" />
                <span>{label}</span>
              </>,
            )}
            {control(
              'page-header-back-button',
              <ArrowLeft size={18} aria-hidden="true" />,
              label,
            )}
          </div>
        ) : null}

        {title != null ? (
          <div className="page-header-title">
            {icon}
            <h1>{title}</h1>
          </div>
        ) : null}

        {actions ? <div className="page-header-actions">{actions}</div> : null}
      </header>
    );
  },
);

PageHeader.displayName = 'PageHeader';

export { PageHeader, type PageHeaderProps, type PageHeaderBack };
