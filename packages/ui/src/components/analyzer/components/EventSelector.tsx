import * as React from "react";
import type { EventData } from '../types';
import EventCard from './EventCard';
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/Card";

import './EventSelector.css'

interface EventSelectorProps {
  events: EventData[];
  selectedEvent: EventData | null;
  onEventSelect: (event: EventData) => void;
}

const EventSelector = React.forwardRef<HTMLDivElement, EventSelectorProps>(
  ({ events, selectedEvent, onEventSelect }, ref) => {
    return (
      <Card 
        className={cn('event-selector')}
        ref={ref}
      >
        <h3>📋 Select Event to Analyze</h3>
        <div className="event-list">
          {events.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              isSelected={selectedEvent?.id === event.id}
              onSelect={onEventSelect}
            />
          ))}
        </div>
      </Card>
    );
  }
);

EventSelector.displayName = "EventSelector";

export { type EventSelectorProps };
export default EventSelector;
