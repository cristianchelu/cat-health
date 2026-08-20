import * as React from 'react';
import { useTranslation } from 'react-i18next';
import Timeline from '@/components/ui/Timeline';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { DateNavigation } from '@/components/ui/DateNavigation';
import { useDeviceEvents } from '@/hooks/queries/deviceQueries';
import { useDateWindowNavigation } from '@/hooks/useDateWindowNavigation';
import { EventTimelineItem, TimelineSkeleton } from '@/components/events';
import { isDeviceTimelineEvent } from '@/components/events/eventTimelineRegistry';
import './DeviceTimeline.css';
import EventDetailsModal from '@/components/events/EventDetailsModal';
import type { GetEventListItemDTO } from 'shared';

interface DeviceTimelineProps {
  deviceId: number;
}

const DeviceTimeline: React.FC<DeviceTimelineProps> = ({ deviceId }) => {
  const { t } = useTranslation();
  const {
    dateRange,
    startTime,
    endTime,
    isCurrentWindow,
    goToPreviousWindow,
    goToNextWindow,
    resetToCurrentWindow,
  } = useDateWindowNavigation({ days: 1 });
  const [selectedEvent, setSelectedEvent] =
    React.useState<GetEventListItemDTO | null>(null);

  const handleEventClick = (event: GetEventListItemDTO) => {
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

  const eventItems = events?.data ?? [];
  const showSkeleton = isLoading && eventItems.length === 0;
  const showOverlay = isFetching;

  return (
    <div className="device-timeline">
      <SectionHeader
        actions={
          <DateNavigation
            date={dateRange.startDate}
            onPrev={goToPreviousWindow}
            onNext={goToNextWindow}
            onReset={resetToCurrentWindow}
            isToday={isCurrentWindow}
          />
        }
      ></SectionHeader>

      <div className="device-timeline-content">
        {error && (
          <div className="device-timeline-error">
            {t('devices.error_loading_events')}
          </div>
        )}

        {!error && (
          <Timeline isLoading={showOverlay}>
            {showSkeleton && <TimelineSkeleton />}
            {!isLoading && (!events || events.data.length === 0) && (
              <li className="device-timeline-empty">
                <p>{t('devices.no_events_for_device')}</p>
              </li>
            )}
            {!isLoading &&
              events &&
              events.data.length > 0 &&
              events.data
                .filter((e) => isDeviceTimelineEvent(e))
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
