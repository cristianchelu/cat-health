import * as React from 'react';
import { FaCheck } from 'react-icons/fa';
import { cn } from '@/lib/utils';
import './EventDataItem.css';

export interface EventDataItemProps {
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export interface EventStatsProps {
  children: React.ReactNode;
  chartAction?: React.ReactNode;
  videoAction?: React.ReactNode;
  humanVerified?: boolean;
  className?: string;
}

export interface EventSelectProps {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export interface EventPetSelectProps {
  value: number | null;
  pets: Array<{ id: number; name: string }>;
  onChange: (petId: number | null) => void;
  disabled?: boolean;
  className?: string;
}

const EventDataItem = React.forwardRef<HTMLDivElement, EventDataItemProps>(
  ({ icon, children, className }, ref) => {
    return (
      <div ref={ref} className={cn('event-data-item', className)}>
        {icon && <span className="event-data-icon">{icon}</span>}
        <span className="event-data-content">{children}</span>
      </div>
    );
  },
);

EventDataItem.displayName = 'EventDataItem';

const EventSelect = React.forwardRef<HTMLSelectElement, EventSelectProps>(
  ({ value, options, onChange, disabled = false, className }, ref) => {
    return (
      <select
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={cn('event-select', className)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  },
);

EventSelect.displayName = 'EventSelect';

const EventPetSelect = React.forwardRef<HTMLSelectElement, EventPetSelectProps>(
  ({ value, pets, onChange, disabled = false, className }, ref) => {
    const handleChange = (selectedValue: string) => {
      if (selectedValue === '') {
        onChange(null);
      } else {
        const petId = parseInt(selectedValue, 10);
        onChange(isNaN(petId) ? null : petId);
      }
    };

    return (
      <select
        ref={ref}
        value={value || ''}
        onChange={(e) => handleChange(e.target.value)}
        disabled={disabled}
        className={cn(
          'event-pet-select',
          value ? 'assigned' : 'unknown',
          className,
        )}
      >
        <option value="">Unknown</option>
        {pets.map((pet) => (
          <option key={pet.id} value={pet.id}>
            {pet.name}
          </option>
        ))}
      </select>
    );
  },
);

EventPetSelect.displayName = 'EventPetSelect';

const EventStats = React.forwardRef<HTMLDivElement, EventStatsProps>(
  ({ children, chartAction, videoAction, humanVerified, className }, ref) => {
    return (
      <div ref={ref} className={cn('event-stats', className)}>
        <div className="event-stats-main">
          {children}
          {videoAction}
          {humanVerified && (
            <FaCheck title="Human verified" className="verification-icon" />
          )}
        </div>
        {chartAction}
      </div>
    );
  },
);

EventStats.displayName = 'EventStats';

export { EventDataItem, EventSelect, EventPetSelect, EventStats };
export default EventDataItem;
