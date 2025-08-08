import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { useState } from 'react';
import { getDevice, getDeviceEvents } from '@/api/devices';
import { deleteEvent, updateEvent } from '@/api/pets';
import type { Event } from '@/api/devices';
import './device-detail.css';
import LitterboxEventItem from '@/components/event/LitterboxUseEvent';

const getDeviceTypeLabel = (type: "litterbox" | "feeder" | "fountain") => {
  switch (type) {
    case "litterbox":
      return "Litter Box";
    case "feeder":
      return "Feeder";
    case "fountain":
      return "Water Fountain";
    default:
      return type;
  }
};

export default function DeviceDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [deletingEventIds, setDeletingEventIds] = useState<Set<number>>(new Set());
  
  const deviceId = id ? Number(id) : NaN;
  const isValidId = !isNaN(deviceId) && deviceId > 0;

  const handleDeleteEvent = async (eventId: number) => {
    setDeletingEventIds(prev => new Set(prev).add(eventId));
    
    try {
      await deleteEvent(eventId);
      await queryClient.invalidateQueries({ queryKey: ['deviceEvents', deviceId] });
    } catch (error) {
      console.error('Failed to delete event:', error);
    } finally {
      setDeletingEventIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(eventId);
        return newSet;
      });
    }
  };

  const handleUpdateEvent = async (eventId: number, data: Record<string, unknown>, human_verified: boolean) => {
    try {
      await updateEvent(eventId, { data, human_verified });
      await queryClient.invalidateQueries({ queryKey: ['deviceEvents', deviceId] });
    } catch (error) {
      console.error('Failed to update event:', error);
      throw error;
    }
  };

  const { data: device, isLoading: deviceLoading, error: deviceError } = useQuery({
    queryKey: ['device', deviceId],
    queryFn: () => getDevice(deviceId),
    enabled: isValidId,
  });

  const { data: events, isLoading: eventsLoading, error: eventsError } = useQuery({
    queryKey: ['deviceEvents', deviceId],
    queryFn: () => getDeviceEvents(deviceId),
    enabled: isValidId,
  });
  
  if (!isValidId) {
    return <div className="device-detail device-detail--error">Invalid device ID.</div>;
  }

  if (deviceLoading || eventsLoading) {
    return <div className="device-detail device-detail--loading">Loading...</div>;
  }
  
  if (deviceError || eventsError) {
    return <div className="device-detail device-detail--error">Error loading device details.</div>;
  }
  
  if (!device) {
    return <div className="device-detail device-detail--empty">Device not found.</div>;
  }

  const groupEventsByType = (events: Event[]): Record<string, Event[]> => {
    return events.reduce((groups, event) => {
      const data = event.data as { type?: string } | null;
      const type = data && typeof data === 'object' && data.type ? data.type : 'Other';
      
      if (!groups[type]) {
        groups[type] = [];
      }
      groups[type].push(event);
      
      return groups;
    }, {} as Record<string, Event[]>);
  };
  
  const eventsByType = groupEventsByType(events || []);

  return (
    <div className="device-detail">
      <div className="card">
        <div className="card-title">{device.name}</div>
        <div className="card-content">
          <div><b>Type:</b> {getDeviceTypeLabel(device.type)}</div>
        </div>
      </div>

      <div>
        <div className="events-title">Events</div>
        {Object.entries(eventsByType).length === 0 && (
          <div className="empty">No events found for this device.</div>
        )}
        {Object.entries(eventsByType).map(([type, events]) => (
          <div key={type} className="event-group">
            <div className="event-group-title">{type}</div>
            <ul className="event-list">
              {events.map(event => {
                if (event.data && typeof event.data === 'object' && 
                    'type' in event.data && event.data.type === 'litterbox_use') {
                  const litterboxData = event.data as {
                    type: "litterbox_use";
                    elimination_type: "urination" | "defecation" | "no_elimination" | "unknown";
                    elimination_weight: number;
                    duration: number;
                  };
                  return (
                    <LitterboxEventItem
                      key={event.id}
                      id={event.id}
                      timestamp={event.timestamp}
                      data={litterboxData}
                      raw_data={event.raw_data}
                      human_verified={event.human_verified}
                      onDelete={() => handleDeleteEvent(event.id)}
                      onUpdate={handleUpdateEvent}
                      isDeleting={deletingEventIds.has(event.id)}
                    />
                  );
                }
                
                return (
                  <li key={event.id} className="event-item">
                    <div className="event-header">
                      <div className="event-timestamp">
                        <b>Timestamp:</b> {new Date(event.timestamp).toLocaleString()}
                      </div>
                      <button
                        className="event-delete-btn"
                        onClick={() => handleDeleteEvent(event.id)}
                        disabled={deletingEventIds.has(event.id)}
                        title="Delete event"
                      >
                        {deletingEventIds.has(event.id) ? '...' : '×'}
                      </button>
                    </div>
                    <pre className="event-data">
                      {JSON.stringify(event.data, null, 2)}
                    </pre>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}