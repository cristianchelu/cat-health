import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, subDays, parseISO } from 'date-fns';
import Timeline from '@/components/ui/Timeline';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { DateNavigation } from '@/components/ui/DateNavigation';
import { useDeviceEvents } from '@/hooks/queries/deviceQueries';
import { EventTimelineItem } from '@/components/events';
import { createDayRange, dateToTimeRange } from '@/lib/utils';
import './DeviceTimeline.css';
import EventDetailsModal from '@/components/events/EventDetailsModal';
import type { GetEventDTO } from 'shared';

interface DeviceTimelineProps {
  deviceId: number;
}

const DeviceTimeline: React.FC<DeviceTimelineProps> = ({ deviceId }) => {
  const { t } = useTranslation();
  const [currentDate, setCurrentDate] = React.useState<string>(
    () => createDayRange().startDate,
  );
  const [selectedEvent, setSelectedEvent] = React.useState<GetEventDTO | null>(
    null,
  );

  const { startTime, endTime } = React.useMemo(() => {
    return dateToTimeRange(currentDate);
  }, [currentDate]);

  const handlePrevDay = () => {
    setCurrentDate(createDayRange(subDays(parseISO(currentDate), 1)).startDate);
  };

  const handleNextDay = () => {
    setCurrentDate(createDayRange(addDays(parseISO(currentDate), 1)).startDate);
  };

  const handleReset = () => {
    setCurrentDate(createDayRange().startDate);
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

  const isCurrentDay = currentDate === createDayRange().startDate;

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
