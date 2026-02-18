import * as React from 'react';
import { useTranslation } from 'react-i18next';
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
  dateFormat = 'MMM d',
  className,
}) => {
  const { t } = useTranslation();
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
    </div>
  );
};
