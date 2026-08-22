import * as React from 'react';
import Timeline, { type TimelineVariant } from '@/components/ui/Timeline';
import type { GetEventListItemDTO } from 'shared';
import { useFormatters } from '@/contexts/RegionalPreferencesProvider';
import EventDevice from './meta/EventDevice';
import EventPet from './meta/EventPet';
import EventVerified from './meta/EventVerified';

export interface TimelineEventShellProps {
  event: GetEventListItemDTO;
  onClick?: () => void;
  showPet?: boolean;
  showDevice?: boolean;
  /**
   * Meta about the event itself — how long it took, what it contained. Runs
   * ahead of the pet and the device, which are the circumstances rather than
   * the event.
   */
  children?: React.ReactNode;
  icon: React.ReactNode;
  /**
   * The row's accent, as a colour rather than a tone name — a CSS colour or a
   * token reference. What an event type looks like is the event type's to say,
   * and the kit mixes it to a legible glyph. Omitted rows read muted.
   */
  iconColor?: string;
  value?: React.ReactNode;
  valueVariant?: TimelineVariant;
  /**
   * For a value that is a phrase rather than a figure. `Timeline.Value` is
   * typed for readings — semibold, tabular — and a row whose value reads
   * "from online" wants body type instead. The variants are tones, so this is
   * a class rather than another one of those.
   */
  valueClassName?: string;
  /** Sits beside the value and breaks with it, for a pill that qualifies it. */
  valueAdornment?: React.ReactNode;
  title: string;
  /**
   * The mark shown when a human has been through this event. Defaults to
   * `EventVerified`; rows with a richer notion of reviewed pass their own.
   */
  verifiedMark?: React.ReactNode;
  className?: string;
}

/**
 * Every event row. The registry decides which event type renders, and the type
 * decides its glyph, its accent and its value — the timestamp, the verified
 * mark, the pet and the device are the same on all of them, so they live here.
 */
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
      iconColor,
      value,
      valueVariant = 'default',
      valueClassName,
      valueAdornment,
      title,
      verifiedMark,
      className,
    },
    ref,
  ) => {
    const { formatTime } = useFormatters();
    return (
      <Timeline.Item
        ref={ref}
        onClick={onClick}
        className={className}
        style={
          iconColor
            ? ({ '--timeline-icon-color': iconColor } as React.CSSProperties)
            : undefined
        }
      >
        <Timeline.Icon>{icon}</Timeline.Icon>
        <Timeline.Content>
          <Timeline.Header>
            <Timeline.Timestamp>
              {formatTime(new Date(event.timestamp))}
            </Timeline.Timestamp>
            {(value != null || valueAdornment) && (
              <Timeline.ValueGroup>
                {value != null && (
                  <Timeline.Value
                    variant={valueVariant}
                    className={valueClassName}
                  >
                    {value}
                  </Timeline.Value>
                )}
                {valueAdornment}
              </Timeline.ValueGroup>
            )}
            <Timeline.TitleGroup>
              {event.human_verified && (verifiedMark ?? <EventVerified />)}
              <Timeline.Title>{title}</Timeline.Title>
            </Timeline.TitleGroup>
          </Timeline.Header>
          <Timeline.Meta>
            {children}
            {showPet && (
              <EventPet petId={event.pet_id} causedBy={event.caused_by} />
            )}
            {showDevice && event.device_id && (
              <EventDevice deviceId={event.device_id} />
            )}
          </Timeline.Meta>
        </Timeline.Content>
      </Timeline.Item>
    );
  },
);

TimelineEventShell.displayName = 'TimelineEventShell';

export default TimelineEventShell;
