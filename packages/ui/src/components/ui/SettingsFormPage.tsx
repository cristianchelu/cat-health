import * as React from 'react';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { LoadingState } from '@/components/ui/PageState';
import { PageBackLink, type PageBackLinkProps } from '@/components/ui/PageBackLink';
import { cn } from '@/lib/utils';
import './SettingsFormPage.css';

interface SettingsFormPageProps extends Omit<
  React.ComponentProps<'div'>,
  'title'
> {
  title?: React.ReactNode;
  icon?: React.ReactNode;
  headerActions?: React.ReactNode;
  isLoading?: boolean;
  loadingMessage?: string;
  /**
   * Back affordance above the header. When a `mobileTitle` is supplied the
   * SectionHeader is hidden on mobile, since the back bar already names the page.
   */
  back?: PageBackLinkProps;
}

const SettingsFormPage = React.forwardRef<
  HTMLDivElement,
  SettingsFormPageProps
>(
  (
    {
      className,
      title,
      icon,
      headerActions,
      isLoading = false,
      loadingMessage,
      back,
      children,
      ...props
    },
    ref,
  ) => {
    return (
      <div className={cn('settings-form-page', className)} ref={ref} {...props}>
        {back && <PageBackLink {...back} />}
        {title != null && (
          <SectionHeader icon={icon} actions={headerActions}>
            {title}
          </SectionHeader>
        )}
        {isLoading ? <LoadingState message={loadingMessage} /> : children}
      </div>
    );
  },
);

SettingsFormPage.displayName = 'SettingsFormPage';

export { SettingsFormPage, type SettingsFormPageProps };
