import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle,
  Clock,
  Timer,
  Toilet,
  Droplets,
  Weight,
  AlertTriangle,
} from 'lucide-react';
import Timeline from '@/components/ui/Timeline';
import { useDeviceEvents } from '@/hooks/queries/deviceQueries';
import { format } from 'date-fns';
import './DeviceTimeline.css';

interface DeviceTimelineProps {
  deviceId: number;
}

const DeviceTimeline: React.FC<DeviceTimelineProps> = ({ deviceId }) => {
  const { t } = useTranslation();

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

  const renderEventIcon = (event: any) => {
    const eventData = event.data;
    if (!eventData || !eventData.type) return <AlertTriangle />;

    switch (eventData.type) {
      case 'litterbox_use':
        return <Toilet />;
      case 'weight_measurement':
        return <Weight />;
      case 'water_intake':
        return <Droplets />;
      default:
        return <Clock />;
    }
  };

  const renderEventVariant = (event: any) => {
    const eventData = event.data;
    if (!eventData || !eventData.type) return 'default';

    switch (eventData.type) {
      case 'litterbox_use':
        if (eventData.elimination_type === 'no_elimination') return 'danger';
        return 'warning';
      case 'weight_measurement':
        return 'primary';
      case 'water_intake':
        return 'primary';
      default:
        return 'default';
    }
  };

  const renderEventTitle = (event: any) => {
    const eventData = event.data;
    if (!eventData || !eventData.type) return 'Unknown Event';

    switch (eventData.type) {
      case 'litterbox_use':
        switch (eventData.elimination_type) {
          case 'urination':
            return t('overview.urination');
          case 'defecation':
            return t('overview.defecation');
          case 'both':
            return t('overview.elimination');
          case 'no_elimination':
            return t('overview.no_elimination');
          default:
            return t('overview.litterbox_visit');
        }
      case 'weight_measurement':
        return 'Weight Measurement';
      case 'water_intake':
        return t('overview.water_intake');
      case 'food_intake':
        return t('overview.food_intake');
      default:
        return eventData.type;
    }
  };

  const renderEventValue = (event: any) => {
    const eventData = event.data;
    if (!eventData) return null;

    switch (eventData.type) {
      case 'litterbox_use':
        return `${eventData.elimination_weight}g`;
      case 'weight_measurement':
        return `${eventData.weight}g`;
      case 'water_intake':
        return `${eventData.amount}ml`;
      case 'food_intake':
        return `${eventData.amount}g`;
      default:
        return null;
    }
  };

  const renderEventMeta = (event: any) => {
    const eventData = event.data;
    const metaItems = [];

    if (eventData?.duration) {
      metaItems.push(
        <Timeline.MetaItem key="duration">
          <Timer />
          {Math.floor(eventData.duration / 60)}m {eventData.duration % 60}s
        </Timeline.MetaItem>,
      );
    }

    if (event.human_verified) {
      metaItems.push(
        <Timeline.MetaItem key="verified">
          <CheckCircle />
          Verified
        </Timeline.MetaItem>,
      );
    }

    return metaItems;
  };

  return (
    <div className="device-timeline">
      <Timeline>
        {events.data.map((event) => (
          <Timeline.Item
            key={event.id}
            variant={
              renderEventVariant(event) === 'danger' ? 'warning' : 'default'
            }
          >
            <Timeline.Icon variant={renderEventVariant(event)}>
              {renderEventIcon(event)}
            </Timeline.Icon>
            <Timeline.Content>
              <Timeline.Header>
                <Timeline.Timestamp>
                  {format(new Date(event.timestamp), 'HH:mm')}
                </Timeline.Timestamp>
                {renderEventValue(event) && (
                  <Timeline.Value variant={renderEventVariant(event)}>
                    {renderEventValue(event)}
                  </Timeline.Value>
                )}
                <Timeline.Title>{renderEventTitle(event)}</Timeline.Title>
              </Timeline.Header>
              {renderEventMeta(event).length > 0 && (
                <Timeline.Meta>{renderEventMeta(event)}</Timeline.Meta>
              )}
            </Timeline.Content>
          </Timeline.Item>
        ))}
      </Timeline>
    </div>
  );
};

export { DeviceTimeline };
