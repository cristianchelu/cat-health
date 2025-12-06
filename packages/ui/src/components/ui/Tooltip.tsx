import * as React from 'react';
import { cn } from '@/lib/utils';
import './Tooltip.css';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  className,
  position = 'top',
}) => {
  return (
    <div className={cn('tooltip-container', className)}>
      {children}
      <div className={cn('tooltip-content', `tooltip-${position}`)}>
        {content}
      </div>
    </div>
  );
};
