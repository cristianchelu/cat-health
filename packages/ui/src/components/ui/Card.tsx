import * as React from 'react';

import { cn } from '@/lib/utils';

import './Card.css';

const Card = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => {
    return (
      <div
        data-slot="card"
        className={cn('card', className)}
        ref={ref}
        {...props}
      />
    );
  },
);

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'>
>(({ className, ...props }, ref) => {
  return (
    <div
      data-slot="card-header"
      className={cn('card-header', className)}
      ref={ref}
      {...props}
    />
  );
});

const CardTitle = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => {
    return (
      <div
        data-slot="card-title"
        className={cn('card-title', className)}
        ref={ref}
        {...props}
      />
    );
  },
);

const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'>
>(({ className, ...props }, ref) => {
  return (
    <div
      data-slot="card-description"
      className={cn('card-description', className)}
      ref={ref}
      {...props}
    />
  );
});

const CardAction = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'>
>(({ className, ...props }, ref) => {
  return (
    <div
      data-slot="card-action"
      className={cn('card-action', className)}
      ref={ref}
      {...props}
    />
  );
});

interface CardContentProps extends React.ComponentProps<'div'> {
  noPadding?: boolean;
}

const CardContent = React.forwardRef<HTMLDivElement, CardContentProps>(
  ({ className, noPadding, ...props }, ref) => {
    return (
      <div
        data-slot="card-content"
        className={cn('card-content', className, { 'no-padding': noPadding })}
        ref={ref}
        {...props}
      />
    );
  },
);

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'>
>(({ className, ...props }, ref) => {
  return (
    <div
      data-slot="card-footer"
      className={cn('card-footer', className)}
      ref={ref}
      {...props}
    />
  );
});

Card.displayName = 'Card';
CardHeader.displayName = 'CardHeader';
CardTitle.displayName = 'CardTitle';
CardDescription.displayName = 'CardDescription';
CardAction.displayName = 'CardAction';
CardContent.displayName = 'CardContent';
CardFooter.displayName = 'CardFooter';

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
};
