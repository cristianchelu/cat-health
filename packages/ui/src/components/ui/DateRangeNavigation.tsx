import { useState } from 'react';
import { FaChevronLeft, FaChevronRight, FaCalendarAlt, FaCog } from 'react-icons/fa';
import type { DateRange, TimeRangeType } from '@/lib/utils';
import { 
  createDateRange, 
  getPreviousDateRange, 
  getNextDateRange, 
  formatDateRangeForDisplay 
} from '@/lib/utils';
import './date-range-navigation.css';

interface DateRangeNavigationProps {
  currentRange: DateRange;
  onRangeChange: (range: DateRange) => void;
  hasEvents?: boolean;
}

export default function DateRangeNavigation({ 
  currentRange, 
  onRangeChange, 
  hasEvents = true 
}: DateRangeNavigationProps) {
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [tempStartDate, setTempStartDate] = useState(currentRange.startDate);
  const [tempEndDate, setTempEndDate] = useState(currentRange.endDate);

  const getTodayString = (): string => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  const isCurrentPeriod = (): boolean => {
    const today = getTodayString();
    return today >= currentRange.startDate && today <= currentRange.endDate;
  };

  const isFutureRange = (): boolean => {
    const today = getTodayString();
    return currentRange.startDate > today;
  };

  const handlePrevious = () => {
    const previousRange = getPreviousDateRange(currentRange);
    onRangeChange(previousRange);
  };

  const handleNext = () => {
    const nextRange = getNextDateRange(currentRange);
    if (!isFutureRange() || nextRange.startDate <= getTodayString()) {
      onRangeChange(nextRange);
    }
  };

  const handleToday = () => {
    const todayRange = createDateRange(getTodayString(), currentRange.type);
    onRangeChange(todayRange);
  };

  const handleRangeTypeChange = (type: TimeRangeType) => {
    if (type === 'custom') {
      setShowCustomPicker(true);
      return;
    }
    
    // Use the start date of current range as reference for new range type
    const newRange = createDateRange(currentRange.startDate, type);
    onRangeChange(newRange);
  };

  const handleCustomRangeApply = () => {
    if (tempStartDate && tempEndDate && tempStartDate <= tempEndDate) {
      const customRange: DateRange = {
        startDate: tempStartDate,
        endDate: tempEndDate,
        type: 'custom'
      };
      onRangeChange(customRange);
      setShowCustomPicker(false);
    }
  };

  const handleCustomRangeCancel = () => {
    setTempStartDate(currentRange.startDate);
    setTempEndDate(currentRange.endDate);
    setShowCustomPicker(false);
  };

  const nextRange = getNextDateRange(currentRange);
  const isNextDisabled = nextRange.startDate > getTodayString();

  return (
    <div className="date-range-navigation">
      <div className="date-range-controls">
        <button
          onClick={handlePrevious}
          className="date-nav-button"
          title="Previous period"
        >
          <FaChevronLeft />
          <span>Previous</span>
        </button>

        <div className="date-display">
          <FaCalendarAlt />
          <span className="date-text">
            {formatDateRangeForDisplay(currentRange)}
          </span>
          {!hasEvents && (
            <span className="date-no-events">
              (No events)
            </span>
          )}
        </div>

        <div className="date-navigation-actions">
          {!isCurrentPeriod() && (
            <button
              onClick={handleToday}
              className="today-button"
              title="Go to current period"
            >
              Today
            </button>
          )}

          <button
            onClick={handleNext}
            disabled={isNextDisabled}
            className="date-nav-button"
            title="Next period"
          >
            <span>Next</span>
            <FaChevronRight />
          </button>
        </div>
      </div>

      <div className="range-type-selector">
        <label className="range-type-label">
          <FaCog className="settings-icon" />
          View:
        </label>
        <select
          value={currentRange.type}
          onChange={(e) => handleRangeTypeChange(e.target.value as TimeRangeType)}
          className="range-type-select"
        >
          <option value="day">Day</option>
          <option value="week">Week</option>
          <option value="month">Month</option>
          <option value="custom">Custom Range</option>
        </select>
      </div>

      {showCustomPicker && (
        <div className="custom-range-picker">
          <div className="custom-range-header">
            <h3>Select Custom Date Range</h3>
          </div>
          <div className="custom-range-inputs">
            <div className="date-input-group">
              <label htmlFor="start-date">Start Date:</label>
              <input
                id="start-date"
                type="date"
                value={tempStartDate}
                onChange={(e) => setTempStartDate(e.target.value)}
                max={getTodayString()}
                className="custom-date-input"
              />
            </div>
            <div className="date-input-group">
              <label htmlFor="end-date">End Date:</label>
              <input
                id="end-date"
                type="date"
                value={tempEndDate}
                onChange={(e) => setTempEndDate(e.target.value)}
                min={tempStartDate}
                max={getTodayString()}
                className="custom-date-input"
              />
            </div>
          </div>
          <div className="custom-range-actions">
            <button
              onClick={handleCustomRangeCancel}
              className="cancel-button"
            >
              Cancel
            </button>
            <button
              onClick={handleCustomRangeApply}
              className="apply-button"
              disabled={!tempStartDate || !tempEndDate || tempStartDate > tempEndDate}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
