import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { addDays, subDays, format, parseISO } from 'date-fns';
import Timeline from '@/components/ui/Timeline';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { DateNavigation } from '@/components/ui/DateNavigation';
import { useDeviceEvents } from '@/hooks/queries/deviceQueries';
import { EventTimelineItem } from '@/components/events';
import { dateToTimeRange } from '@/lib/utils';
import './DeviceTimeline.css';

interface DeviceTimelineProps {
  deviceId: number;
}

const DeviceTimeline: React.FC<DeviceTimelineProps> = ({ deviceId }) => {
  const getTodayString = () => new Date().toISOString().split('T')[0];
  const [currentDate, setCurrentDate] = React.useState<string>(getTodayString);

  const { startTime, endTime } = React.useMemo(() => {
    return dateToTimeRange(currentDate);
  }, [currentDate]);

  const handlePrevDay = () => {
    const current = parseISO(currentDate);
    const prev = subDays(current, 1);
    setCurrentDate(format(prev, 'yyyy-MM-dd'));
  };

  const handleNextDay = () => {
    const current = parseISO(currentDate);
    const next = addDays(current, 1);
    setCurrentDate(format(next, 'yyyy-MM-dd'));
  };

  const handleReset = () => {
    setCurrentDate(getTodayString());
  };

  const {
    data: events,
    isLoading,
    isFetching,
    error,
  } = useDeviceEvents(deviceId, startTime, endTime, true);

  const isCurrentDay = currentDate === getTodayString();

  return (
    <div className="device-timeline">
      <SectionHeader
        actions={
          <DateNavigation
            date={currentDate}
            onPrev={handlePrevDay}
            onNext={handleNextDay}
            onReset={handleReset}
            isToday={isCurrentDay}
          />
        }
      ></SectionHeader>

      <div className="device-timeline-content">
        {error && (
          <div className="device-timeline-error">Error loading events</div>
        )}

        {!error && (
          <Timeline>
            {isFetching && !isLoading && (
              <div className="device-timeline-overlay">
                <Loader2 className="animate-spin" size={32} />
              </div>
            )}
            {isLoading && (
              <li className="device-timeline-loading">Loading events...</li>
            )}
            {!isLoading && (!events || events.data.length === 0) && (
              <li className="device-timeline-empty">
                <p>No events found for this device</p>
              </li>
            )}
            {!isLoading &&
              events &&
              events.data.length > 0 &&
              events.data
                .filter((e) => e.data.type !== 'weight_measurement')
                .map((event) => (
                  <EventTimelineItem key={event.id} event={event} />
                ))}
          </Timeline>
        )}
      </div>
    </div>
  );
};

export { DeviceTimeline };
