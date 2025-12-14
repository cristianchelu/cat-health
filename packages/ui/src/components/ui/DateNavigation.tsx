import * as React from 'react';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import './DateNavigation.css';

interface DateNavigationProps {
  date: string; // YYYY-MM-DD
  onPrev: () => void;
  onNext: () => void;
  onReset: () => void;
  isToday: boolean;
  dateFormat?: string;
  showTodayLabel?: boolean;
  todayLabel?: string;
  className?: string;
}

export const DateNavigation: React.FC<DateNavigationProps> = ({
  date,
  onPrev,
  onNext,
  onReset,
  isToday,
  dateFormat = 'MMM d, yyyy',
  showTodayLabel = true,
  todayLabel = 'Today',
  className,
}) => {
  return (
    <div className={cn('date-navigation', className)}>
      <Button variant="ghost" size="sm" icon onClick={onPrev}>
        <ChevronLeft size={20} />
      </Button>
      <span className="date-navigation-display">
        {format(parseISO(date), dateFormat)}
      </span>
      <Button
        variant="ghost"
        size="sm"
        icon
        onClick={onNext}
        disabled={isToday}
      >
        <ChevronRight size={20} />
      </Button>
      {!isToday && (
        <Button
          variant="ghost"
          size="sm"
          icon={!showTodayLabel}
          onClick={onReset}
          title="Today"
          className={showTodayLabel ? 'date-navigation-today-btn' : ''}
        >
          <RotateCcw
            size={16}
            style={showTodayLabel ? { marginRight: '0.5rem' } : undefined}
          />
          {showTodayLabel && todayLabel}
        </Button>
      )}
    </div>
  );
};
