import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { useState } from 'react';
import { getPet, getPetEvents, deleteEvent, updateEvent, getPets } from '@/api/pets';
import LitterboxEventItem from '@/components/event/LitterboxUseEvent';
import LitterboxMaintenanceEventItem from '@/components/event/LitterboxMaintenanceEvent';
import WeightMeasurementEventItem from '@/components/event/WeightMeasurementEvent';
import DateRangeNavigation from '@/components/ui/DateRangeNavigation';
import PetSummaryCard from '@/components/ui/PetSummaryCard';
import WeightTrendChart from '@/components/ui/WeightTrendChart';
import LitterboxVisitsChart from '@/components/ui/LitterboxVisitsChart';
import { dateRangeToTimeRange, createDateRange, type DateRange } from '@/lib/utils';

import './PetDetail.css';
import { LitterboxAnalyzer } from '@/components/analyzer';

export default function PetDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [deletingEventIds, setDeletingEventIds] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState<'events' | 'analyzer'>('events');
  
  // Initialize current date range to today
  const [currentDateRange, setCurrentDateRange] = useState<DateRange>(() => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD format
    return createDateRange(todayStr, 'day');
  });
  
  const petId = id ? Number(id) : NaN;
  const isValidId = !isNaN(petId) && petId > 0;

  const handleDeleteEvent = async (eventId: number) => {
    // if (!confirm('Are you sure you want to delete this event?')) {
    //   return;
    // }

    setDeletingEventIds(prev => new Set(prev).add(eventId));
    
    try {
      await deleteEvent(eventId);
      await queryClient.invalidateQueries({ queryKey: ['petEvents', petId, currentDateRange] });
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
      await queryClient.invalidateQueries({ queryKey: ['petEvents', petId, currentDateRange] });
    } catch (error) {
      console.error('Failed to update event:', error);
      throw error; // Re-throw so the component can handle the error
    }
  };

  const handleUpdateLitterboxEvent = async (eventId: number, data: { type: "litterbox_use"; elimination_type: string; elimination_weight: number; duration: number }, human_verified: boolean, pet_id?: number | null) => {
    return handleUpdateEvent(eventId, data as Record<string, unknown>, human_verified, pet_id);
  };

  const handleUpdateMaintenanceEvent = async (eventId: number, data: { type: "litterbox_maintenance"; maintenance_type: string; litter_amount?: number }, human_verified: boolean) => {
    return handleUpdateEvent(eventId, data as Record<string, unknown>, human_verified);
  };

  const handleUpdateWeightEvent = async (eventId: number, data: { type: "weight_measurement"; weight: number }, human_verified: boolean, pet_id?: number | null) => {
    return handleUpdateEvent(eventId, data as Record<string, unknown>, human_verified, pet_id);
  };

  const { data: pet, isLoading: petLoading, error: petError } = useQuery({
    queryKey: ['pet', petId],
    queryFn: () => getPet(petId),
    enabled: isValidId,
  });

  const { data: eventsData, isLoading: eventsLoading, error: eventsError } = useQuery({
    queryKey: ['petEvents', petId, currentDateRange],
    queryFn: () => {
      const { startTime, endTime } = dateRangeToTimeRange(currentDateRange);
      return getPetEvents(petId, startTime, endTime, 5000);
    },
    enabled: isValidId,
  });

  const { data: pets, isLoading: petsLoading } = useQuery({
    queryKey: ['pets'],
    queryFn: getPets,
  });
  
  if (!isValidId) {
    return <div className="pet-detail pet-detail--error">Invalid pet ID.</div>;
  }

  if (petLoading || eventsLoading || petsLoading) {
    return <div className="pet-detail pet-detail--loading">Loading...</div>;
  }
  
  if (petError || eventsError) {
    return <div className="pet-detail pet-detail--error">Error loading pet details.</div>;
  }
  
  if (!pet) {
    return <div className="pet-detail pet-detail--empty">Pet not found.</div>;
  }
  
  const events = eventsData?.events || [];
  const hasEvents = events.length > 0;

  return (
    <div className="pet-detail">
      <PetSummaryCard pet={pet} />
      
      {/* Tab Navigation */}
      <div className="tab-navigation">
        <button 
          className={`tab-button ${activeTab === 'events' ? 'active' : ''}`}
          onClick={() => setActiveTab('events')}
        >
          📅 Events
        </button>
        <button 
          className={`tab-button ${activeTab === 'analyzer' ? 'active' : ''}`}
          onClick={() => setActiveTab('analyzer')}
        >
          🔬 Event Analyzer
        </button>
      </div>
      <DateRangeNavigation 
        currentRange={currentDateRange}
        onRangeChange={setCurrentDateRange}
        hasEvents={hasEvents}
      />
      {activeTab === 'events' && (
        <>
          <WeightTrendChart 
            key={`weight-chart-${petId}`}
            petId={pet.id} 
            petName={pet.name} 
            petBirthDate={pet.birth_date} 
            className="weight-chart"
          />
          
          <LitterboxVisitsChart 
            key={`visits-chart-${petId}`}
            petId={pet.id}
            className="visits-chart"
          />
          
          <div className="events-section">
            <div className="events-title">Events</div>

            {events.length === 0 && (
              <div className="empty">No events found for this date.</div>
            )}
            
            <ul className="event-list">
              {events.map(event => {
                // Check if this is a litterbox event
                if (event.data && typeof event.data === 'object' && 
                    'type' in event.data && event.data.type === 'litterbox_use') {
                  const litterboxData = event.data as {
                    type: "litterbox_use";
                    elimination_type: "urination" | "defecation" | "both" | "no_elimination" | "unknown";
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
                
                // Fallback for other event types
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
        </>
      )}

      {activeTab === 'analyzer' && (
        <LitterboxAnalyzer key={`analyzer-${petId}-${activeTab}`} events={events} />
      )}
    </div>
  );
}
