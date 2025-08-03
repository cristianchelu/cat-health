import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { useState } from 'react';
import { getPet, getPetEvents, addEvent, deleteEvent } from '@/api/pets';
import type { Event } from '@/api/pets';
import DebugEventForm from '@/components/DebugEventForm';
import './pet-detail.css';

export default function PetDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [deletingEventIds, setDeletingEventIds] = useState<Set<number>>(new Set());
  
  const petId = id ? Number(id) : NaN;
  const isValidId = !isNaN(petId) && petId > 0;

  const handleAddEvent = async (eventData: unknown) => {
    await addEvent({ pet_id: petId, data: eventData, device_id: null });
    await queryClient.invalidateQueries({ queryKey: ['petEvents', petId] });
  };

  const handleDeleteEvent = async (eventId: number) => {
    if (!confirm('Are you sure you want to delete this event?')) {
      return;
    }

    setDeletingEventIds(prev => new Set(prev).add(eventId));
    
    try {
      await deleteEvent(eventId);
      await queryClient.invalidateQueries({ queryKey: ['petEvents', petId] });
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

  const { data: pet, isLoading: petLoading, error: petError } = useQuery({
    queryKey: ['pet', petId],
    queryFn: () => getPet(petId),
    enabled: isValidId,
  });

  const { data: events, isLoading: eventsLoading, error: eventsError } = useQuery({
    queryKey: ['petEvents', petId],
    queryFn: () => getPetEvents(petId),
    enabled: isValidId,
  });
  
  if (!isValidId) {
    return <div className="pet-detail pet-detail--error">Invalid pet ID.</div>;
  }

  if (petLoading || eventsLoading) {
    return <div className="pet-detail pet-detail--loading">Loading...</div>;
  }
  
  if (petError || eventsError) {
    return <div className="pet-detail pet-detail--error">Error loading pet details.</div>;
  }
  
  if (!pet) {
    return <div className="pet-detail pet-detail--empty">Pet not found.</div>;
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
    <div className="pet-detail">
      <div className="card">
        <div className="card-title">{pet.name}</div>
        <div className="card-content">
          <div><b>Breed:</b> {pet.breed}</div>
          <div><b>Birth Date:</b> {pet.birth_date}</div>
        </div>
      </div>

      <DebugEventForm onSubmit={handleAddEvent} />

      <div>
        <div className="events-title">Events</div>
        {Object.entries(eventsByType).length === 0 && (
          <div className="empty">No events found for this pet.</div>
        )}
        {Object.entries(eventsByType).map(([type, events]) => (
          <div key={type} className="event-group">
            <div className="event-group-title">{type}</div>
            <ul className="event-list">
              {events.map(event => (
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
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
