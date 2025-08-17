import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { useState } from 'react';
import { getDevice, getDeviceEvents, type Event } from '@/api/devices';
import { deleteEvent, updateEvent, getPets} from '@/api/pets';
import LitterboxEventItem from '@/components/event/LitterboxUseEvent';
import LitterboxMaintenanceEventItem from '@/components/event/LitterboxMaintenanceEvent';
import WeightMeasurementEventItem from '@/components/event/WeightMeasurementEvent';
import DateNavigation from '@/components/ui/DateNavigation';
import { dateToTimeRange } from '@/lib/utils';

import './DeviceDetail.css';
import { Card, CardContent, CardTitle } from '@/components/ui/Card';

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
  
  // Initialize current date to today
  const [currentDate, setCurrentDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0]; // YYYY-MM-DD format
  });
  
  const deviceId = id ? Number(id) : NaN;
  const isValidId = !isNaN(deviceId) && deviceId > 0;

  const handleDeleteEvent = async (eventId: number) => {
    setDeletingEventIds(prev => new Set(prev).add(eventId));
    
    try {
      await deleteEvent(eventId);
      await queryClient.invalidateQueries({ queryKey: ['deviceEvents', deviceId, currentDate] });
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

  const handleUpdateEvent = async (eventId: number, data: Record<string, unknown>, human_verified: boolean, pet_id?: number | null) => {
    try {
      await updateEvent(eventId, { data, human_verified, pet_id });
      await queryClient.invalidateQueries({ queryKey: ['deviceEvents', deviceId, currentDate] });
    } catch (error) {
      console.error('Failed to update event:', error);
      throw error;
    }
  };

  const handleUpdateLitterboxEvent = async (eventId: number, data: { type: "litterbox_use"; elimination_type: string; elimination_weight: number; duration: number }, human_verified: boolean, pet_id?: number | null) => {
    return handleUpdateEvent(eventId, data as Record<string, unknown>, human_verified, pet_id);
  };

  const handleUpdateMaintenanceEvent = async (eventId: number, data: { type: "litterbox_maintenance"; maintenance_type: string; litter_amount?: number; }, human_verified: boolean) => {
    return handleUpdateEvent(eventId, data as Record<string, unknown>, human_verified);
  };

  const handleUpdateWeightEvent = async (eventId: number, data: { type: "weight_measurement"; weight: number }, human_verified: boolean, pet_id?: number | null) => {
    return handleUpdateEvent(eventId, data as Record<string, unknown>, human_verified, pet_id);
  };

  const { data: device, isLoading: deviceLoading, error: deviceError } = useQuery({
    queryKey: ['device', deviceId],
    queryFn: () => getDevice(deviceId),
    enabled: isValidId,
  });

  const { data: eventsData = { events: [], total: 0, hasMore: false, limit: 0, offset: 0 }, isLoading: eventsLoading, error: eventsError } = useQuery({
    queryKey: ['deviceEvents', deviceId, currentDate],
    queryFn: () => {
      const { startTime, endTime } = dateToTimeRange(currentDate);
      return getDeviceEvents(deviceId, startTime, endTime);
    },
    enabled: isValidId,
  });

  const { data: pets, isLoading: petsLoading } = useQuery({
    queryKey: ['pets'],
    queryFn: getPets,
  });
  
  if (!isValidId) {
    return <div className="device-detail device-detail--error">Invalid device ID.</div>;
  }

  if (deviceLoading || eventsLoading || petsLoading) {
    return <div className="device-detail device-detail--loading">Loading...</div>;
  }
  
  if (deviceError || eventsError) {
    return <div className="device-detail device-detail--error">Error loading device details.</div>;
  }
  
  if (!device) {
    return <div className="device-detail device-detail--empty">Device not found.</div>;
  }

  const events = eventsData.events;
  const hasEvents = events.length > 0;

  return (
    <div className="device-detail">
      <Card>
        <CardTitle>{device.name}</CardTitle>
        <CardContent>
          <div><b>Type:</b> {getDeviceTypeLabel(device.type)}</div>
        </CardContent>
      </Card>
      <div>
        <div className="events-title">Events</div>
        <DateNavigation 
          currentDate={currentDate}
          onDateChange={setCurrentDate}
          hasEvents={hasEvents}
        />
        
        {events.length === 0 && (
          <div className="empty">No events found for this date.</div>
        )}
        <div className="event-group">
          <ul className="event-list">
            {events.sort((a: Event, b: Event) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()).map((event: Event) => {
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
                    pet_id={event.pet_id}
                    timestamp={event.timestamp}
                    data={litterboxData}
                    raw_data={event.raw_data}
                    human_verified={event.human_verified}
                    pets={pets || []}
                    onDelete={() => handleDeleteEvent(event.id)}
                    onUpdate={handleUpdateLitterboxEvent}
                    isDeleting={deletingEventIds.has(event.id)}
                  />
                );
              }

              // Check if this is a maintenance event
              if (event.data && typeof event.data === 'object' && 
                  'type' in event.data && event.data.type === 'litterbox_maintenance') {
                const maintenanceData = event.data as {
                  type: "litterbox_maintenance";
                  maintenance_type: "scoop" | "deep_clean" | "litter_change" | "litter_addition";
                  litter_amount?: number;
                };
                return (
                  <LitterboxMaintenanceEventItem
                    key={event.id}
                    id={event.id}
                    pet_id={event.pet_id}
                    timestamp={event.timestamp}
                    data={maintenanceData}
                    raw_data={event.raw_data}
                    human_verified={event.human_verified}
                    onDelete={() => handleDeleteEvent(event.id)}
                    onUpdate={handleUpdateMaintenanceEvent}
                    isDeleting={deletingEventIds.has(event.id)}
                  />
                );
              }
              
              // Check if this is a weight measurement event
              if (event.data && typeof event.data === 'object' && 
                  'type' in event.data && event.data.type === 'weight_measurement') {
                const weightData = event.data as {
                  type: "weight_measurement";
                  weight: number;
                };
                return (
                  <WeightMeasurementEventItem
                    key={event.id}
                    id={event.id}
                    pet_id={event.pet_id}
                    timestamp={event.timestamp}
                    data={weightData}
                    raw_data={event.raw_data}
                    human_verified={event.human_verified}
                    pets={pets || []}
                    onDelete={() => handleDeleteEvent(event.id)}
                    onUpdate={handleUpdateWeightEvent}
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
      </div>
    </div>
  );
}