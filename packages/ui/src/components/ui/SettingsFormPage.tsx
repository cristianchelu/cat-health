import * as React from 'react';
import {
  AppHeader,
  AppHeaderBar,
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
   * Where leaving lands. These screens are reached from one place and edit one
   * thing, so they are the pages most likely to be arrived at by deep link —
   * name the destination rather than trusting history.
   */
  back?: AppHeaderBack;
  headerActions?: React.ReactNode;
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
      isLoading = false,
      loadingMessage,
      children,
      ...props
    },
    ref,
  ) => {
    return (
      <div className={cn('settings-form-page', className)} ref={ref} {...props}>
        {title != null && (
          <AppHeader>
            <AppHeaderBar back={back} title={title} actions={headerActions} />
          </AppHeader>
        )}
        {isLoading ? <LoadingState message={loadingMessage} /> : children}
      </div>
    );
  },
);

SettingsFormPage.displayName = 'SettingsFormPage';

export { SettingsFormPage, type SettingsFormPageProps };
