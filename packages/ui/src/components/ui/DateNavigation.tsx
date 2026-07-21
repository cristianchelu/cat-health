import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn, parseCalendarDate } from '@/lib/utils';
import { useFormatters } from '@/contexts/RegionalPreferencesProvider';
import './DateNavigation.css';

interface DateNavigationProps {
  date: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  onPrev: () => void;
  onNext: () => void;
  onReset: () => void;
  isToday: boolean;
  showTodayLabel?: boolean;
  todayLabel?: string;
  className?: string;
}

export const DateNavigation: React.FC<DateNavigationProps> = ({
  date,
  endDate,
  onPrev,
  onNext,
  onReset,
  isToday,
  className,
}) => {
  const { t } = useTranslation();
  const { formatDate, timezone } = useFormatters();

  const formatNavDate = (value: string) =>
    formatDate(parseCalendarDate(value, timezone), 'short');

  const isRange = Boolean(endDate && endDate !== date);
  const prevLabel = t(
    isRange ? 'overview.previous_period' : 'overview.previous_day',
  );
  const nextLabel = t(isRange ? 'overview.next_period' : 'overview.next_day');

  return (
    <div className={cn('date-navigation', className)}>
      {!isToday && (
        <Button
          variant="ghost"
          size="sm"
          icon
          onClick={onReset}
          title={t('overview.today')}
          className={'date-navigation-today-btn'}
        >
          <RotateCcw size={16} />
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        icon
        onClick={onPrev}
        title={prevLabel}
        aria-label={prevLabel}
      >
        <ChevronLeft size={20} />
      </Button>
      <span className="date-navigation-display">
        {isRange && endDate
          ? `${formatNavDate(date)} - ${formatNavDate(endDate)}`
          : formatNavDate(date)}
      </span>
      <Button
        variant="ghost"
        size="sm"
        icon
        onClick={onNext}
        disabled={isToday}
        title={nextLabel}
        aria-label={nextLabel}
      >
        <ChevronRight size={20} />
      </Button>
    </div>
  );
};
