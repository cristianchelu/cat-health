import * as React from 'react';

import { Card, CardContent } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

import './Timeline.css';

type TimelineVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger';

type TimelineProps = React.ComponentProps<typeof Card>;

interface TimelineItemProps extends React.ComponentProps<'li'> {
  variant?: 'default' | 'warning' | 'danger';
}

interface TimelineIconProps extends React.ComponentProps<'div'> {
  variant?: TimelineVariant;
}

interface TimelineValueProps extends React.ComponentProps<'span'> {
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
  ({ className, variant = 'default', children, ...props }, ref) => {
    return (
      <li
        className={cn(
          'timeline-item',
          variant !== 'default' && `timeline-item-${variant}`,
          className,
        )}
        ref={ref}
        {...props}
      >
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

const TimelineValue = React.forwardRef<HTMLSpanElement, TimelineValueProps>(
  ({ className, variant = 'default', ...props }, ref) => {
    return (
      <span
        className={cn(
          'timeline-value',
          variant !== 'default' && `timeline-value-${variant}`,
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);

const TimelineMetaItem = React.forwardRef<
  HTMLSpanElement,
  React.ComponentProps<'span'>
>(({ className, ...props }, ref) => {
  return (
    <span
      className={cn('timeline-meta-item', className)}
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
TimelineValue.displayName = 'Timeline.Value';
TimelineDescription.displayName = 'Timeline.Description';
TimelineMeta.displayName = 'Timeline.Meta';
TimelineMetaItem.displayName = 'Timeline.MetaItem';
TimelineFooter.displayName = 'Timeline.Footer';
TimelineBadge.displayName = 'Timeline.Badge';

const Timeline = Object.assign(TimelineRoot, {
  Item: TimelineItem,
  Icon: TimelineIcon,
  Content: TimelineContent,
  Header: TimelineHeader,
  Title: TimelineTitle,
  Timestamp: TimelineTimestamp,
  Value: TimelineValue,
  Description: TimelineDescription,
  Meta: TimelineMeta,
  MetaItem: TimelineMetaItem,
  Footer: TimelineFooter,
  Badge: TimelineBadge,
});

export {
  type TimelineProps,
  type TimelineItemProps,
  type TimelineIconProps,
  type TimelineValueProps,
  type TimelineBadgeProps,
  TimelineBadge,
  TimelineContent,
  TimelineDescription,
  TimelineFooter,
  TimelineHeader,
  TimelineIcon,
  TimelineItem,
  TimelineMeta,
  TimelineMetaItem,
  TimelineTimestamp,
  TimelineTitle,
  TimelineValue,
};
export default Timeline;
