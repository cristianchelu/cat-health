import * as React from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { Check, ChevronRight } from 'lucide-react';

import './CardList.css';
import { Card, CardContent } from './Card';

interface CardListProps {
  children: React.ReactNode;
  className?: string;
  /**
   * `card` is the settings-page list, on a Card of its own. `plain` is the
   * same rows on a surface that is already there — a dialog, a fieldset —
   * clipped the same way so the end rows keep their corners. `bare` is for
   * rows that are not a list at all: one or two of them inside something
   * that already has padding, so they bring none of a list's chrome.
   */
  variant?: 'card' | 'plain' | 'bare';
}

export const CardList: React.FC<CardListProps> = ({
  children,
  className,
  variant = 'card',
}) => {
  if (variant !== 'card') {
    return (
      <div className={cn('settings-list', variant, className)}>{children}</div>
    );
  }

  return (
    <Card>
      <CardContent noPadding className={cn('settings-list', className)}>
        {children}
      </CardContent>
    </Card>
  );
};

interface CardListItemProps {
  /** Omit for rows that are all text — a picker's options, usually. */
  icon?: React.ReactNode;
  /**
   * How the icon is set: `plain` is the bare mark, the other two put it on a
   * rounded tile — `primary` where the row is its card's subject, `muted`
   * where it is one detail among several.
   */
  iconTone?: 'plain' | 'muted' | 'primary';
  children: React.ReactNode;
  /** Navigate via React Router `Link` when set. Prefer over `onClick` for routes. */
  to?: string;
  /** React Router location state (e.g. `backState(...)` for non-canonical entries). */
  state?: unknown;
  /** Action handler; renders a `<button>` when `to` is not set. */
  onClick?: () => void;
  trailing?: React.ReactNode;
  /** The row that is currently chosen: a wash behind it and a check at its end. */
  selected?: boolean;
  /**
   * What the row's end promises. Defaults to a chevron for a row that goes
   * somewhere and nothing for one that does not. `check` is for rows that
   * pick rather than navigate — the mark appears only on the chosen one.
   */
  indicator?: 'chevron' | 'check' | 'radio' | 'none';
  /**
   * Makes the row one option of a set: a real `<input type="radio">`, hidden
   * behind the row that labels it, so keyboard roving, form semantics and
   * screen-reader grouping come from the platform rather than from us.
   */
  radio?: {
    name: string;
    value: string;
    checked: boolean;
    onChange: () => void;
    disabled?: boolean;
  };
  className?: string;
}

export const CardListItem: React.FC<CardListItemProps> = ({
  icon,
  iconTone = 'plain',
  children,
  to,
  state,
  onClick,
  trailing,
  selected = false,
  indicator,
  radio,
  className,
}) => {
  const interactive = Boolean(to || onClick || radio);
  const mark =
    indicator ?? (radio ? 'radio' : interactive ? 'chevron' : 'none');
  const itemClassName = cn(
    'list-item',
    { 'list-item--static': !interactive, 'list-item--selected': selected },
    className,
  );

  const content = (
    <>
      <div className="item-left">
        {icon && <div className={cn('item-icon', iconTone)}>{icon}</div>}
        <div className="item-content">{children}</div>
      </div>
      {(trailing ||
        mark === 'chevron' ||
        mark === 'radio' ||
        (mark === 'check' && selected)) && (
        <div className="item-trailing">
          {trailing}
          {mark === 'chevron' && (
            <ChevronRight size={20} className="item-arrow" />
          )}
          {mark === 'check' && selected && (
            <Check size={20} className="item-check" aria-hidden="true" />
          )}
          {mark === 'radio' && (
            <span className="item-radio" aria-hidden="true" />
          )}
        </div>
      )}
    </>
  );

  if (radio) {
    return (
      <label
        className={itemClassName}
        data-disabled={radio.disabled || undefined}
      >
        <input
          type="radio"
          className="sr-only"
          name={radio.name}
          value={radio.value}
          checked={radio.checked}
          disabled={radio.disabled}
          onChange={radio.onChange}
        />
        {content}
      </label>
    );
  }

  if (to) {
    return (
      <Link
        to={to}
        state={state}
        className={itemClassName}
        onClick={onClick}
        aria-current={selected || undefined}
      >
        {content}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        className={itemClassName}
        onClick={onClick}
        aria-current={selected || undefined}
      >
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
