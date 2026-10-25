import * as React from 'react';
import { cn } from '@/lib/utils';
import { SectionHeader } from '@/components/ui/SectionHeader';
import './FormSection.css';

interface FormSectionProps extends Omit<
  React.ComponentProps<'section'>,
  'title'
> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
}

/**
 * A titled block of a form: a compact `SectionHeader` above one card. The card
 * carries no header of its own, and the section owns the header-to-card gap.
 */
const FormSection = React.forwardRef<HTMLElement, FormSectionProps>(
  ({ title, subtitle, icon, actions, className, children, ...props }, ref) => (
    <section className={cn('form-section', className)} ref={ref} {...props}>
      {title != null && (
        <SectionHeader
          size="compact"
          icon={icon}
          subtitle={subtitle}
          actions={actions}
        >
          {title}
        </SectionHeader>
      )}
      {children}
    </section>
  ),
);

FormSection.displayName = 'FormSection';

export { FormSection, type FormSectionProps };
