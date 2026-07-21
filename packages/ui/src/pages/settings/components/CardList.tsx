import * as React from 'react';
import { Link } from 'react-router';
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
  /** Navigate via React Router `Link` when set. Prefer over `onClick` for routes. */
  to?: string;
  /** Action handler; renders a `<button>` when `to` is not set. */
  onClick?: () => void;
  trailing?: React.ReactNode;
  className?: string;
}

export const CardListItem: React.FC<CardListItemProps> = ({
  icon,
  children,
  to,
  onClick,
  trailing,
  className,
}) => {
  const interactive = Boolean(to || onClick);
  const itemClassName = cn(
    'list-item',
    { 'list-item--static': !interactive },
    className,
  );

  const content = (
    <>
      <div className="item-left">
        <div className={'item-icon'}>{icon}</div>
        <div className="item-content">{children}</div>
      </div>
      {trailing ?? (interactive ? <ChevronRight size={20} className="item-arrow" /> : null)}
    </>
  );

  if (to) {
    return (
      <Link to={to} className={itemClassName} onClick={onClick}>
        {content}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" className={itemClassName} onClick={onClick}>
        {content}
      </button>
    );
  }

  return <div className={itemClassName}>{content}</div>;
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
