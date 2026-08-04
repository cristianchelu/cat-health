import * as React from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppHeaderScroll } from '@/hooks/useAppHeaderScroll';
import './AppHeader.css';

interface AppHeaderBack {
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

interface AppHeaderProps extends React.ComponentProps<'header'> {
  /**
   * Once the header has settled part-way open, take it away again after a beat.
   * Phone-only, and it waits its turn: a header you are focused inside stays.
   */
  autoHide?: boolean;
  /**
   * A nudge up brings back the `AppHeaderRow` alone, leaving the title bar
   * above it tucked away. Without a row there is nothing to reveal separately,
   * and this does nothing.
   */
  revealTabsOnly?: boolean;
}

interface AppHeaderBarProps extends Omit<React.ComponentProps<'div'>, 'title'> {
  /** Back affordance. Omit on a page that is its own root. */
  back?: AppHeaderBack;
  /** The page title — rendered as the page's one `<h1>`. */
  title?: React.ReactNode;
  /**
   * Secondary line under the title: what the page holds, not what you can do
   * to it. Counts and status belong here rather than in `actions`, which is
   * for controls. Rendered inside a `<p>`, so keep it to phrasing content.
   */
  subtitle?: React.ReactNode;
  /** Trailing controls. */
  actions?: React.ReactNode;
  /**
   * Drop the whole bar below 768px, for the pages whose phone chrome is the
   * `AppHeaderRow` itself — the overview and health screens lead with the pet
   * strip, because switching cat is the thing you came to the top of the page
   * to do. Desktop still gets a title bar; there the strip lives in the sidebar.
   */
  desktopOnly?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface AppHeaderRowProps extends React.ComponentProps<'div'> {}

/**
 * Lets the shell measure the trailing row without owning what goes in it — the
 * row is a tab list on a device page and the pet strip on the overview, and the
 * shell only ever needs its height.
 */
const AppHeaderContext = React.createContext<{
  registerRow: (el: HTMLDivElement | null) => void;
} | null>(null);

/**
 * The app's page chrome, and the only place a page heading belongs.
 *
 * A shell rather than a fixed layout: it owns stickiness and the phone-only
 * scroll behaviour (see `useAppHeaderScroll`), and the rows are yours to
 * compose. Usually that is an `AppHeaderBar` and an `AppHeaderRow`:
 *
 * ```tsx
 * <AppHeader>
 *   <AppHeaderBar back={{ to: '/devices', label: 'Devices' }} title={device.name} />
 *   <AppHeaderRow><TabsList>…</TabsList></AppHeaderRow>
 * </AppHeader>
 * ```
 *
 * It is composable because the rows genuinely differ per page. The overview
 * leads with a pet switcher where a device page leads with a title, and both
 * want the same sticky, hide-on-scroll surface underneath. Hardcoding the title
 * bar would mean either a second sticky bar stacked on this one — which is what
 * this replaces — or a prop for every shape a page might want.
 */
const AppHeader = React.forwardRef<HTMLElement, AppHeaderProps>(
  (
    { autoHide = true, revealTabsOnly = true, className, children, ...props },
    ref,
  ) => {
    const rootRef = React.useRef<HTMLElement | null>(null);
    const rowRef = React.useRef<HTMLDivElement | null>(null);

    useAppHeaderScroll(rootRef, rowRef, { autoHide, revealTabsOnly });

    const setRoot = React.useCallback(
      (node: HTMLElement | null) => {
        rootRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      },
      [ref],
    );

    const context = React.useMemo(
      () => ({
        registerRow: (node: HTMLDivElement | null) => {
          rowRef.current = node;
        },
      }),
      [],
    );

    return (
      <AppHeaderContext.Provider value={context}>
        <header
          className={cn('app-header', className)}
          ref={setRoot}
          {...props}
        >
          {children}
        </header>
      </AppHeaderContext.Provider>
    );
  },
);

/**
 * The title row: back control, `<h1>`, subtitle, actions.
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
const AppHeaderBar = React.forwardRef<HTMLDivElement, AppHeaderBarProps>(
  (
    {
      back,
      title,
      subtitle,
      actions,
      desktopOnly = false,
      className,
      ...props
    },
    ref,
  ) => {
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
      <div
        className={cn(
          'app-header-bar',
          desktopOnly && 'app-header-bar-desktop-only',
          className,
        )}
        ref={ref}
        {...props}
      >
        {back ? (
          <div className="app-header-back">
            {control(
              'app-header-back-link',
              <>
                <ArrowLeft size={16} aria-hidden="true" />
                <span>{label}</span>
              </>,
            )}
            {control(
              'app-header-back-button',
              <ArrowLeft size={18} aria-hidden="true" />,
              label,
            )}
          </div>
        ) : null}

        {title != null ? (
          <div className="app-header-title">
            <div className="app-header-title-text">
              <h1>{title}</h1>
              {subtitle ? (
                <p className="app-header-subtitle">{subtitle}</p>
              ) : null}
            </div>
          </div>
        ) : null}

        {actions ? <div className="app-header-actions">{actions}</div> : null}
      </div>
    );
  },
);

/**
 * The strip along the header's bottom edge — a tab list, a pet switcher.
 *
 * On a phone it scrolls sideways and keeps its active child in view, and it is
 * what `revealTabsOnly` brings back on its own. Only the last one mounted is
 * measured; a header with two of these is a header with an ambiguous idea of
 * what "the tabs" are.
 */
const AppHeaderRow = React.forwardRef<HTMLDivElement, AppHeaderRowProps>(
  ({ className, children, ...props }, ref) => {
    const context = React.useContext(AppHeaderContext);
    const localRef = React.useRef<HTMLDivElement | null>(null);
    const registerRow = context?.registerRow;

    const setRow = React.useCallback(
      (node: HTMLDivElement | null) => {
        localRef.current = node;
        registerRow?.(node);
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      },
      [ref, registerRow],
    );

    /*
     * Keep the active child in view. The row holds arbitrary children, so this
     * goes by `aria-selected` / `.tabs-trigger-active` rather than by knowing
     * what a tab is, and re-runs on click because the active child moves.
     */
    const centerActive = React.useCallback(() => {
      const row = localRef.current;
      const active = row?.querySelector<HTMLElement>(
        '[aria-selected="true"], [aria-current="page"], .tabs-trigger-active, .item.active',
      );
      if (!row || !active) return;
      row.scrollLeft = Math.max(
        0,
        active.offsetLeft - (row.clientWidth - active.offsetWidth) / 2,
      );
    }, []);

    React.useEffect(() => {
      centerActive();
    }, [centerActive, children]);

    return (
      <div
        className={cn('app-header-row', className)}
        ref={setRow}
        onClick={() => window.setTimeout(centerActive, 0)}
        {...props}
      >
        {children}
      </div>
    );
  },
);

AppHeader.displayName = 'AppHeader';
AppHeaderBar.displayName = 'AppHeaderBar';
AppHeaderRow.displayName = 'AppHeaderRow';

export {
  AppHeader,
  AppHeaderBar,
  AppHeaderRow,
  type AppHeaderProps,
  type AppHeaderBarProps,
  type AppHeaderRowProps,
  type AppHeaderBack,
};
