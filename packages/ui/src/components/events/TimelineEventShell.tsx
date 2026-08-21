import * as React from 'react';
import Timeline from '@/components/ui/Timeline';
import { cn } from '@/lib/utils';
import type { GetEventListItemDTO } from 'shared';
import { useFormatters } from '@/contexts/RegionalPreferencesProvider';
import EventDevice from './meta/EventDevice';
import EventPet from './meta/EventPet';
import EventVerified from './meta/EventVerified';
import './TimelineEventShell.css';

type TimelineShellVariant =
  | 'default'
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger';

export interface TimelineEventShellProps {
  event: GetEventListItemDTO;
  onClick?: () => void;
  showPet?: boolean;
  showDevice?: boolean;
  children?: React.ReactNode;
  icon: React.ReactNode;
  iconVariant?: TimelineShellVariant;
  value?: React.ReactNode;
  valueVariant?: TimelineShellVariant;
  /**
   * For a value that is a phrase rather than a figure. `Timeline.Value` is
   * typed for readings — semibold, tabular — and a row whose value reads
   * "from online" wants body type instead. The variants are tones, so this is
   * a class rather than another one of those.
   */
  valueClassName?: string;
  title: string;
  className?: string;
  itemStyle?: React.CSSProperties;
}

const TimelineEventShell = React.forwardRef<
  HTMLLIElement,
  TimelineEventShellProps
>(
  (
    {
      event,
      onClick,
      showPet = true,
      showDevice = true,
      children,
      icon,
      iconVariant = 'default',
      value,
      valueVariant = 'default',
      valueClassName,
      title,
      className,
      itemStyle,
    },
    ref,
  ) => {
    const { formatTime } = useFormatters();
    return (
      <Timeline.Item
        ref={ref}
        onClick={onClick}
        className={cn('timeline-event-shell', className)}
        style={itemStyle}
      >
        <Timeline.Icon variant={iconVariant}>{icon}</Timeline.Icon>
        <Timeline.Content>
          <Timeline.Header>
            <Timeline.Timestamp>
              {formatTime(new Date(event.timestamp))}
            </Timeline.Timestamp>
            {value != null && (
              <Timeline.Value variant={valueVariant} className={valueClassName}>
                {value}
              </Timeline.Value>
            )}
            <Timeline.TitleGroup>
              {event.human_verified && <EventVerified />}
              <Timeline.Title>{title}</Timeline.Title>
            </Timeline.TitleGroup>
          </Timeline.Header>
          <Timeline.Meta>
            {showPet && (
              <EventPet petId={event.pet_id} causedBy={event.caused_by} />
            )}
            {showDevice && event.device_id && (
              <EventDevice deviceId={event.device_id} />
            )}
            {children}
          </Timeline.Meta>
        </Timeline.Content>
      </Timeline.Item>
    );
  },
);

TimelineEventShell.displayName = 'TimelineEventShell';

export default TimelineEventShell;
