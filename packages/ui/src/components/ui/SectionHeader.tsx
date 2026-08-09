import * as React from 'react';
import { cn } from '@/lib/utils';

import './SectionHeader.css';

interface SectionHeaderProps {
  icon?: React.ReactNode;
  children?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  /**
   * `compact` is for device-tab forms stacking several headers over one
   * page (Camera/Recognition): smaller title, tighter margins. Never used
   * for the Overview/Settings section headers, which keep the default size.
   */
  size?: 'default' | 'compact';
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  icon,
  children,
  subtitle,
  actions,
  className,
  size = 'default',
}) => {
  return (
    <div
      className={cn(
        'section-header',
        size === 'compact' && 'section-header--compact',
        className,
      )}
    >
      <div className="section-header-title">
        {icon}
        <div className="section-header-heading">
          {children && <h2>{children}</h2>}
          {subtitle && <p className="section-header-subtitle">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="section-header-actions">{actions}</div>}
    </div>
  );
};
