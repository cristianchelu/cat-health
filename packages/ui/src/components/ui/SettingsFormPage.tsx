import * as React from 'react';
import {
  AppHeader,
  AppHeaderBar,
  AppHeaderRow,
  type AppHeaderBack,
} from '@/components/ui/AppHeader';
import { LoadingState } from '@/components/ui/PageState';
import { cn } from '@/lib/utils';
import './SettingsFormPage.css';

interface SettingsFormPageProps extends Omit<
  React.ComponentProps<'div'>,
  'title'
> {
  title?: React.ReactNode;
  /**
   * Canonical parent for leave navigation. Resolved with `location.state.back`
   * when a non-canonical entry passed one — see `useBackNavigation`.
   */
  back?: AppHeaderBack;
  headerActions?: React.ReactNode;
  /**
   * The form's tab list, rendered as the app bar's bottom row. A long form
   * scrolls its own tab strip out of reach if the strip sits in the page; in
   * the header it comes back with a nudge up — see `AppHeader`'s
   * `revealTabsOnly`. The `Tabs` root has to wrap this component for the
   * triggers to find their context.
   */
  tabs?: React.ReactNode;
  isLoading?: boolean;
  loadingMessage?: string;
}

const SettingsFormPage = React.forwardRef<
  HTMLDivElement,
  SettingsFormPageProps
>(
  (
    {
      className,
      title,
      back,
      headerActions,
      tabs,
      isLoading = false,
      loadingMessage,
      children,
      ...props
    },
    ref,
  ) => {
    return (
      <div
        className={cn('page-shell-narrow', 'settings-form-page', className)}
        ref={ref}
        {...props}
      >
        {title != null && (
          <AppHeader>
            <AppHeaderBar back={back} title={title} actions={headerActions} />
            {tabs ? <AppHeaderRow>{tabs}</AppHeaderRow> : null}
          </AppHeader>
        )}
        {isLoading ? <LoadingState message={loadingMessage} /> : children}
      </div>
    );
  },
);

SettingsFormPage.displayName = 'SettingsFormPage';

export { SettingsFormPage, type SettingsFormPageProps };
