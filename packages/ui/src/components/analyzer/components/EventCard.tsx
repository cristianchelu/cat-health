import * as React from "react";
import { FaCalendarAlt, FaCheck, FaWeight, FaClock } from 'react-icons/fa';
import type { EventData } from '../types';
import { getEliminationIcon } from '../lib/utils';

import './EventCard.css';

interface EventCardProps {
  event: EventData;
  isSelected: boolean;
  onSelect: (event: EventData) => void;
}

const EventCard = React.forwardRef<HTMLDivElement, EventCardProps>(
  ({ event, isSelected, onSelect }, ref) => {
    const eliminationType = String(event.data.elimination_type) || 'unknown';
    const weight = event.data.elimination_weight;
    const duration = event.data.duration;

    const handleClick = () => {
      onSelect(event);
    };

    return (
      <div
        className={`event-card ${isSelected ? 'selected' : ''}`}
        onClick={handleClick}
        ref={ref}
      >
        <div className="event-header">
          <div className="event-type-icon">
            {getEliminationIcon(eliminationType)}
          </div>
          <div className="event-details">
            <div className="event-time">
              <FaCalendarAlt className="time-icon" />
              {new Date(event.timestamp).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
            {event.human_verified && <FaCheck className="verified-icon" />}
          </div>
        </div>
        <div className="event-metrics">
          <span className="metric">
            <FaWeight className="metric-icon" />
            {String(weight || 'N/A')}g
          </span>
          <span className="metric">
            <FaClock className="metric-icon" />
            {typeof duration === 'number' ? `${(Number(duration) / 1000).toFixed(1)}s` : 'N/A'}
          </span>
        </div>
      </div>
    );
  }
);

EventCard.displayName = "EventCard";

export { type EventCardProps };
export default EventCard;
