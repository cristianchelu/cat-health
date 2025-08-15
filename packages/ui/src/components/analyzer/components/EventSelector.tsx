import * as React from "react";
import type { EventData } from '../types';
import EventCard from './EventCard';

interface EventSelectorProps {
  events: EventData[];
  selectedEvent: EventData | null;
  onEventSelect: (event: EventData) => void;
  hasAnalysis: boolean;
}

const EventSelector = React.forwardRef<HTMLDivElement, EventSelectorProps>(
  ({ events, selectedEvent, onEventSelect, hasAnalysis }, ref) => {
    return (
      <div 
        className={`event-selector${hasAnalysis ? ' has-analysis' : ''}`}
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
      </div>
    );
  }
);

EventSelector.displayName = "EventSelector";

export { type EventSelectorProps };
export default EventSelector;
