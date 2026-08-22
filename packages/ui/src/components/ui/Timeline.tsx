import * as React from 'react';

import { Card, CardContent } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

import './Timeline.css';

type TimelineVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger';

interface TimelineValueProps extends React.ComponentProps<'span'> {
  variant?: TimelineVariant;
}

interface TimelineBadgeProps extends React.ComponentProps<'span'> {
  variant?: Exclude<TimelineVariant, 'default'> | 'neutral';
}

const TimelineRoot = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof Card>
>(({ className, children, ...props }, ref) => {
  return (
    <Card className={cn('timeline', className)} ref={ref} {...props}>
      <CardContent className="timeline-body">
        <ul className="timeline-list">{children}</ul>
      </CardContent>
    </Card>
  );
});

const TimelineItem = React.forwardRef<
  HTMLLIElement,
  React.ComponentProps<'li'>
>(({ className, children, ...props }, ref) => {
  return (
    <li className={cn('timeline-item', className)} ref={ref} {...props}>
      {children}
    </li>
  );
});

/**
 * The glyph that says what kind of event this is. Its colour is the row's, not
 * the kit's: set `--timeline-icon-color` on the item and the disc and glyph
 * follow. A tone name would have to mean something here, and every meaning a
 * timeline row wants — a litterbox hue, a device state — is the row's to know.
 */
const TimelineIcon = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'>
>(({ className, children, ...props }, ref) => {
  return (
    <div className={cn('timeline-icon', className)} ref={ref} {...props}>
      {children}
    </div>
  );
});

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

const TimelineTitleGroup = React.forwardRef<
  HTMLSpanElement,
  React.ComponentProps<'span'>
>(({ className, ...props }, ref) => {
  return (
    <span
      className={cn('timeline-title-group', className)}
      ref={ref}
      {...props}
    />
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
TimelineTitleGroup.displayName = 'Timeline.TitleGroup';
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
  TitleGroup: TimelineTitleGroup,
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
  type TimelineValueProps,
  type TimelineBadgeProps,
  TimelineBadge,
  TimelineContent,
  TimelineDescription,
  TimelineFooter,
  TimelineHeader,
  TimelineTitleGroup,
  TimelineIcon,
  TimelineItem,
  TimelineMeta,
  TimelineMetaItem,
  TimelineTimestamp,
  TimelineTitle,
  TimelineValue,
};
export default Timeline;
