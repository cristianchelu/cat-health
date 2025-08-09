import { FaChevronLeft, FaChevronRight, FaCalendarAlt } from 'react-icons/fa';

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
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      gap: '12px', 
      padding: '16px 0',
      borderBottom: '1px solid #eee',
      marginBottom: '16px'
    }}>
      <button
        onClick={handlePrevious}
        style={{
          padding: '8px 12px',
          border: '1px solid #ddd',
          borderRadius: '4px',
          background: '#fff',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        }}
        title="Previous day"
      >
        <FaChevronLeft />
        Previous
      </button>

      <div style={{ 
        flex: 1, 
        textAlign: 'center',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px'
      }}>
        <FaCalendarAlt style={{ color: '#666' }} />
        <span style={{ fontSize: '16px', fontWeight: '500' }}>
          {formatDateForDisplay(currentDate)}
        </span>
        {!hasEvents && (
          <span style={{ fontSize: '14px', color: '#888', fontStyle: 'italic' }}>
            (No events)
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        {!isToday(currentDate) && (
          <button
            onClick={handleToday}
            style={{
              padding: '8px 12px',
              border: '1px solid #007acc',
              borderRadius: '4px',
              background: '#007acc',
              color: 'white',
              cursor: 'pointer'
            }}
            title="Go to today"
          >
            Today
          </button>
        )}

        <button
          onClick={handleNext}
          disabled={isFuture(getNextDay(currentDate))}
          style={{
            padding: '8px 12px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            background: isFuture(getNextDay(currentDate)) ? '#f5f5f5' : '#fff',
            cursor: isFuture(getNextDay(currentDate)) ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            opacity: isFuture(getNextDay(currentDate)) ? 0.5 : 1
          }}
          title="Next day"
        >
          Next
          <FaChevronRight />
        </button>
      </div>

      <input
        type="date"
        value={currentDate}
        onChange={handleDateInputChange}
        max={getTodayString()}
        style={{
          padding: '8px',
          border: '1px solid #ddd',
          borderRadius: '4px',
          background: '#fff'
        }}
        title="Select date"
      />
    </div>
  );
}
