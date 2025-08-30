import * as React from "react";
import { FaCalendarAlt } from "react-icons/fa";
import { cn } from "@/lib/utils";
import "./BaseEvent.css";

export interface BaseEventProps {
  id: number;
  pet_id: number | null;
  timestamp: string;
  human_verified: boolean;
  isDeleting: boolean;
  onDelete: () => void;
  className?: string;
  children?: React.ReactNode;
}

interface BaseEventHeaderProps {
  timestamp: string;
  isDeleting: boolean;
  onDelete: () => void;
}

interface BaseEventContentProps {
  children: React.ReactNode;
  className?: string;
}

const BaseEventHeader = React.forwardRef<HTMLDivElement, BaseEventHeaderProps>(
  ({ timestamp, isDeleting, onDelete }, ref) => {
    return (
      <div ref={ref} className="event-header">
        <div className="event-timestamp">
          <FaCalendarAlt />
          <b>{new Date(timestamp).toLocaleString()}</b>
        </div>
        <button
          className={cn("event-delete-btn", { disabled: isDeleting })}
          onClick={onDelete}
          disabled={isDeleting}
          title="Delete event"
        >
          {isDeleting ? '...' : '×'}
        </button>
      </div>
    );
  }
);

BaseEventHeader.displayName = "BaseEventHeader";

const BaseEventContent = React.forwardRef<HTMLDivElement, BaseEventContentProps>(
  ({ children, className }, ref) => {
    return (
      <div ref={ref} className={cn("event-content", className)}>
        {children}
      </div>
    );
  }
);

BaseEventContent.displayName = "BaseEventContent";

const BaseEvent = React.forwardRef<HTMLLIElement, BaseEventProps>(
  ({ id, timestamp, isDeleting, onDelete, className, children }, ref) => {
    return (
      <li ref={ref} className={cn("base-event-item", className)} data-event-id={id}>
        <BaseEventHeader
          timestamp={timestamp}
          isDeleting={isDeleting}
          onDelete={onDelete}
        />
        <BaseEventContent>
          {children}
        </BaseEventContent>
      </li>
    );
  }
);

BaseEvent.displayName = "BaseEvent";

export { BaseEventHeader, BaseEventContent };
export default BaseEvent;
