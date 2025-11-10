import * as React from 'react';
import { cn } from '@/lib/utils';

import './SectionHeader.css';

interface SectionHeaderProps {
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  icon,
  children,
  className,
}) => {
  return (
    <div className={cn('section-header', className)}>
      {icon}
      <h2>{children}</h2>
    </div>
  );
};
