import * as React from 'react';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { LoadingState } from '@/components/ui/PageState';
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
      children,
      ...props
    },
    ref,
  ) => {
    return (
      <div className={cn('settings-form-page', className)} ref={ref} {...props}>
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
