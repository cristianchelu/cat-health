import * as React from 'react';

import { Card, CardContent } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

import './Timeline.css';

type TimelineVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger';

type TimelineProps = React.ComponentProps<typeof Card>;

type TimelineItemProps = React.ComponentProps<'li'>;

interface TimelineIconProps extends React.ComponentProps<'div'> {
  variant?: TimelineVariant;
}

interface TimelineBadgeProps extends React.ComponentProps<'span'> {
  variant?: Exclude<TimelineVariant, 'default'> | 'neutral';
}

const TimelineRoot = React.forwardRef<HTMLDivElement, TimelineProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <Card className={cn('timeline', className)} ref={ref} {...props}>
        <CardContent className="timeline-body">
          <ul className="timeline-list">{children}</ul>
        </CardContent>
      </Card>
    );
  },
);

const TimelineItem = React.forwardRef<HTMLLIElement, TimelineItemProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <li className={cn('timeline-item', className)} ref={ref} {...props}>
        {children}
      </li>
    );
  },
);

const TimelineIcon = React.forwardRef<HTMLDivElement, TimelineIconProps>(
  ({ className, variant = 'default', children, ...props }, ref) => {
    return (
      <div
        className={cn(
          'timeline-icon',
          variant !== 'default' && `timeline-icon-${variant}`,
          className,
        )}
        ref={ref}
        {...props}
      >
        {children}
      </div>
    );
  },
);

const TimelineContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'>
>(({ className, ...props }, ref) => {
  return (
    <div className={cn('timeline-content', className)} ref={ref} {...props} />
  );
});

const TimelineHeader = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'>
>(({ className, ...props }, ref) => {
  return (
    <div className={cn('timeline-header', className)} ref={ref} {...props} />
  );
});

const TimelineTitle = React.forwardRef<
  HTMLSpanElement,
  React.ComponentProps<'span'>
>(({ className, ...props }, ref) => {
  return (
    <span className={cn('timeline-label', className)} ref={ref} {...props} />
  );
});

const TimelineTimestamp = React.forwardRef<
  HTMLSpanElement,
  React.ComponentProps<'span'>
>(({ className, ...props }, ref) => {
  return (
    <span
      className={cn('timeline-timestamp', className)}
      ref={ref}
      {...props}
    />
  );
});

const TimelineDescription = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentProps<'p'>
>(({ className, ...props }, ref) => {
  return (
    <p className={cn('timeline-description', className)} ref={ref} {...props} />
  );
});

const TimelineMeta = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'>
>(({ className, ...props }, ref) => {
  return (
    <div className={cn('timeline-meta', className)} ref={ref} {...props} />
  );
});

const TimelineFooter = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'>
>(({ className, ...props }, ref) => {
  return (
    <div className={cn('timeline-footer', className)} ref={ref} {...props} />
  );
});

const TimelineBadge = React.forwardRef<HTMLSpanElement, TimelineBadgeProps>(
  ({ className, variant = 'neutral', ...props }, ref) => {
    return (
      <span
        className={cn(
          'timeline-badge',
          variant !== 'neutral' && `timeline-badge-${variant}`,
          variant === 'neutral' && 'timeline-badge-neutral',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);

TimelineRoot.displayName = 'Timeline';
TimelineItem.displayName = 'Timeline.Item';
TimelineIcon.displayName = 'Timeline.Icon';
TimelineContent.displayName = 'Timeline.Content';
TimelineHeader.displayName = 'Timeline.Header';
TimelineTitle.displayName = 'Timeline.Title';
TimelineTimestamp.displayName = 'Timeline.Timestamp';
TimelineDescription.displayName = 'Timeline.Description';
TimelineMeta.displayName = 'Timeline.Meta';
TimelineFooter.displayName = 'Timeline.Footer';
TimelineBadge.displayName = 'Timeline.Badge';

const Timeline = Object.assign(TimelineRoot, {
  Item: TimelineItem,
  Icon: TimelineIcon,
  Content: TimelineContent,
  Header: TimelineHeader,
  Title: TimelineTitle,
  Timestamp: TimelineTimestamp,
  Description: TimelineDescription,
  Meta: TimelineMeta,
  Footer: TimelineFooter,
  Badge: TimelineBadge,
});

export {
  type TimelineProps,
  type TimelineItemProps,
  type TimelineIconProps,
  type TimelineBadgeProps,
  TimelineBadge,
  TimelineContent,
  TimelineDescription,
  TimelineFooter,
  TimelineHeader,
  TimelineIcon,
  TimelineItem,
  TimelineMeta,
  TimelineTimestamp,
  TimelineTitle,
};
export default Timeline;
