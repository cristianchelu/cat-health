import React from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Plus } from 'lucide-react';
import { usePetContext } from '@/hooks/context/usePetContext';
import { usePetEvents } from '@/hooks/queries/petQueries';
import { useDateWindowNavigation } from '@/hooks/useDateWindowNavigation';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { DateNavigation } from '@/components/ui/DateNavigation';
import { Button } from '@/components/ui/Button';
import Timeline from '@/components/ui/Timeline';
import { EventTimelineItem, TimelineSkeleton } from '@/components/events';
import { isPetOverviewActivityEvent } from '@/components/events/eventTimelineRegistry';
import EventDetailsModal from '@/components/events/EventDetailsModal';
import LogFoodModal from '@/components/events/LogFoodModal';

import WeightTrendCard from '@/pages/overview/components/WeightTrendCard';
import WaterConsumptionCard from '@/pages/overview/components/WaterConsumptionCard';
import FoodIntakeCard from '@/pages/overview/components/FoodIntakeCard';
import LitterboxVisitsCard from '@/pages/overview/components/LitterboxVisitsCard';

import './Overview.css';
import type { GetEventDTO } from 'shared';

const Overview: React.FC = () => {
  const { t } = useTranslation();
  const { selectedPet, isLoading: isPetsLoading } = usePetContext();
  const petId = selectedPet?.id ?? 0;
  const showPetContent = !!selectedPet || isPetsLoading;
  const [selectedEvent, setSelectedEvent] = React.useState<GetEventDTO | null>(
    null,
  );
  const [showFoodModal, setShowFoodModal] = React.useState(false);

  const {
    dateRange,
    isCurrentWindow,
    goToPreviousWindow,
    goToNextWindow,
    resetToCurrentWindow,
  } = useDateWindowNavigation({ days: 1 });

  const handleEventClick = (event: GetEventDTO) => {
    setSelectedEvent(event);
  };

  const handleCloseModal = () => {
    setSelectedEvent(null);
  };

  const {
    data: eventsData,
    isLoading,
    isFetching,
  } = usePetEvents(petId, dateRange, !!selectedPet);

  const isActivityLoading = isPetsLoading || isLoading || isFetching;
  const showActivitySkeleton =
    (isPetsLoading || isLoading) && !eventsData?.data?.length;
  const showActivityOverlay = isActivityLoading;

  const dateNavigation = (
    <DateNavigation
      date={dateRange.startDate}
      onPrev={goToPreviousWindow}
      onNext={goToNextWindow}
      onReset={resetToCurrentWindow}
      isToday={isCurrentWindow}
    />
  );

  const activityActions = (
    <>
      {selectedPet && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setShowFoodModal(true)}
        >
          <Plus size={16} />
          {t('overview.log_food')}
        </Button>
      )}
      {dateNavigation}
    </>
  );

  return (
    <div className="page-overview">
      <section className="widget-grid">
        {showPetContent && (
          <WeightTrendCard petId={petId} isPending={isPetsLoading} />
        )}
        {showPetContent && (
          <WaterConsumptionCard petId={petId} isPending={isPetsLoading} />
        )}
        {showPetContent && (
          <FoodIntakeCard petId={petId} isPending={isPetsLoading} />
        )}
        {showPetContent && (
          <LitterboxVisitsCard petId={petId} isPending={isPetsLoading} />
        )}
      </section>
      <section>
        <SectionHeader icon={<Clock />} actions={activityActions}>
          {t('overview.activity')}
        </SectionHeader>
        <div className="overview-timeline-container">
          <Timeline isLoading={showActivityOverlay}>
            {showActivitySkeleton && <TimelineSkeleton />}
            {!showActivityOverlay && eventsData?.data.length === 0 && (
              <li className="overview-empty-activity">
                {t('overview.no_activity')}
              </li>
            )}
            {eventsData?.data
              .filter((ev) => isPetOverviewActivityEvent(ev))
              .map((event) => (
                <EventTimelineItem
                  key={event.id}
                  onClick={() => handleEventClick(event)}
                  event={event}
                  showPet={false}
                  showDevice={true}
                />
              ))}
          </Timeline>
        </div>
      </section>
      <EventDetailsModal
        isOpen={selectedEvent !== null}
        event={selectedEvent}
        onClose={handleCloseModal}
      />
      {selectedPet && (
        <LogFoodModal
          isOpen={showFoodModal}
          onClose={() => setShowFoodModal(false)}
          petId={selectedPet.id}
          dateRange={dateRange}
        />
      )}
    </div>
  );
};

export default Overview;
