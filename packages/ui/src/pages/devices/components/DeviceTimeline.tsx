import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, subDays, format, parseISO } from 'date-fns';
import Timeline from '@/components/ui/Timeline';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { DateNavigation } from '@/components/ui/DateNavigation';
import { useDeviceEvents } from '@/hooks/queries/deviceQueries';
import { EventTimelineItem } from '@/components/events';
import { dateToTimeRange } from '@/lib/utils';
import './DeviceTimeline.css';
import EventDetailsModal from '@/components/events/EventDetailsModal';
import type { GetEventDTO } from 'shared';

interface DeviceTimelineProps {
  deviceId: number;
}

const DeviceTimeline: React.FC<DeviceTimelineProps> = ({ deviceId }) => {
  const { t } = useTranslation();
  const getTodayString = () => new Date().toISOString().split('T')[0];
  const [currentDate, setCurrentDate] = React.useState<string>(getTodayString);
  const [selectedEvent, setSelectedEvent] = React.useState<GetEventDTO | null>(
    null,
  );

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

  const handleEventClick = (event: GetEventDTO) => {
    setSelectedEvent(event);
  };

  const handleCloseModal = () => {
    setSelectedEvent(null);
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
          <div className="device-timeline-error">{t('devices.error_loading_events')}</div>
        )}

        {!error && (
          <Timeline isLoading={isFetching && !isLoading}>
            {isLoading && (
              <li className="device-timeline-loading">{t('devices.loading_events')}</li>
            )}
            {!isLoading && (!events || events.data.length === 0) && (
              <li className="device-timeline-empty">
                <p>{t('devices.no_events_for_device')}</p>
              </li>
            )}
            {!isLoading &&
              events &&
              events.data.length > 0 &&
              events.data
                .filter((e) => e.data.type !== 'weight_measurement')
                .map((event) => (
                  <EventTimelineItem
                    key={event.id}
                    onClick={() => handleEventClick(event)}
                    event={event}
                    showPet={true}
                    showDevice={false}
                  />
                ))}
          </Timeline>
        )}
      </div>
      <EventDetailsModal
        isOpen={selectedEvent !== null}
        event={selectedEvent}
        onClose={handleCloseModal}
      />
    </div>
  );
};

export { DeviceTimeline };
