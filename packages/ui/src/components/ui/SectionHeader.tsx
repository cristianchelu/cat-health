import * as React from 'react';
import { cn } from '@/lib/utils';

import './SectionHeader.css';

interface SectionHeaderProps {
  icon: React.ReactNode;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  icon,
  children,
  actions,
  className,
}) => {
  return (
    <div className={cn('section-header', className)}>
      <div className="section-header-title">
        {icon}
        <h2>{children}</h2>
      </div>
      {actions && <div className="section-header-actions">{actions}</div>}
    </div>
  );
};
