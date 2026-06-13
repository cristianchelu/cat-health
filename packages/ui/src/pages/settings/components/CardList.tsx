import * as React from 'react';
import { cn } from '@/lib/utils';
import { ChevronRight } from 'lucide-react';

import './CardList.css';
import { Card, CardContent } from '@/components/ui/Card';

interface CardListProps {
  children: React.ReactNode;
  className?: string;
}

export const CardList: React.FC<CardListProps> = ({ children, className }) => {
  return (
    <Card>
      <CardContent noPadding className={cn('settings-list', className)}>
        {children}
      </CardContent>
    </Card>
  );
};

interface CardListItemProps {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
  trailing?: React.ReactNode;
  className?: string;
}

export const CardListItem: React.FC<CardListItemProps> = ({
  icon,
  children,
  onClick,
  trailing,
  className,
}) => {
  return (
    <div
      className={cn('list-item', { 'list-item--static': !onClick }, className)}
      onClick={onClick}
    >
      <div className="item-left">
        <div className={'item-icon'}>{icon}</div>
        <div className="item-content">{children}</div>
      </div>
      {trailing ?? (onClick ? <ChevronRight size={20} className="item-arrow" /> : null)}
    </div>
  );
};

interface CardListContentProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
}

export const CardListContent: React.FC<CardListContentProps> = ({
  title,
  description,
  className,
}) => {
  return (
    <div className={cn('item-content-wrapper', className)}>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
    </div>
  );
};
