import * as React from 'react';
import { Clock } from 'lucide-react';
import Timeline from '@/components/ui/Timeline';
import { useDeviceEvents } from '@/hooks/queries/deviceQueries';
import { EventTimelineItem } from '@/components/events';
import './DeviceTimeline.css';

interface DeviceTimelineProps {
  deviceId: number;
}

const DeviceTimeline: React.FC<DeviceTimelineProps> = ({ deviceId }) => {
  const { startTime, endTime } = React.useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30); // Last 30 days
    return {
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    };
  }, []);

  const {
    data: events,
    isLoading,
    error,
  } = useDeviceEvents(deviceId, startTime, endTime, true);

  if (isLoading) {
    return <div className="device-timeline-loading">Loading events...</div>;
  }

  if (error) {
    return <div className="device-timeline-error">Error loading events</div>;
  }

  if (!events || events.data.length === 0) {
    return (
      <div className="device-timeline-empty">
        <Clock size="2em" />
        <p>No events found for this device</p>
      </div>
    );
  }

  return (
    <div className="device-timeline">
      <Timeline>
        {events.data
          .filter((e) => e.data.type !== 'weight_measurement')
          .map((event) => (
            <EventTimelineItem key={event.id} event={event} />
          ))}
      </Timeline>
    </div>
  );
};

export { DeviceTimeline };
