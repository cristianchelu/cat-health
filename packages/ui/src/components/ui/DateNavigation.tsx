import { FaChevronLeft, FaChevronRight, FaCalendarAlt } from 'react-icons/fa';
import './date-navigation.css';

interface DateNavigationProps {
  currentDate: string; // YYYY-MM-DD format
  onDateChange: (date: string) => void;
  hasEvents?: boolean;
}

export default function DateNavigation({ currentDate, onDateChange, hasEvents = true }: DateNavigationProps) {
  const formatDateForDisplay = (dateStr: string): string => {
    const date = new Date(dateStr + 'T00:00:00.000Z');
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const getPreviousDay = (dateStr: string): string => {
    const date = new Date(dateStr + 'T00:00:00.000Z');
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().split('T')[0];
  };

  const getNextDay = (dateStr: string): string => {
    const date = new Date(dateStr + 'T00:00:00.000Z');
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().split('T')[0];
  };

  const getTodayString = (): string => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  const isToday = (dateStr: string): boolean => {
    return dateStr === getTodayString();
  };

  const isFuture = (dateStr: string): boolean => {
    return dateStr > getTodayString();
  };

  const handlePrevious = () => {
    onDateChange(getPreviousDay(currentDate));
  };

  const handleNext = () => {
    if (!isFuture(getNextDay(currentDate))) {
      onDateChange(getNextDay(currentDate));
    }
  };

  const handleToday = () => {
    onDateChange(getTodayString());
  };

  const handleDateInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    if (newDate && !isFuture(newDate)) {
      onDateChange(newDate);
    }
  };

  return (
    <div className="date-navigation">
      <button
        onClick={handlePrevious}
        className="date-nav-button"
        title="Previous day"
      >
        <FaChevronLeft />
        <span>Previous</span>
      </button>

      <div className="date-display">
        <FaCalendarAlt />
        <span className="date-text">
          {formatDateForDisplay(currentDate)}
        </span>
        {!hasEvents && (
          <span className="date-no-events">
            (No events)
          </span>
        )}
      </div>

      <div className="date-navigation-actions">
        {!isToday(currentDate) && (
          <button
            onClick={handleToday}
            className="today-button"
            title="Go to today"
          >
            Today
          </button>
        )}

        <button
          onClick={handleNext}
          disabled={isFuture(getNextDay(currentDate))}
          className="date-nav-button"
          title="Next day"
        >
          <span>Next</span>
          <FaChevronRight />
        </button>
      </div>

      <input
        type="date"
        value={currentDate}
        onChange={handleDateInputChange}
        max={getTodayString()}
        className="date-selector"
        title="Select date"
      />
    </div>
  );
}
