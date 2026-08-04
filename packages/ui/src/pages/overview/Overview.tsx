import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Clock, Drumstick } from 'lucide-react';
import { usePetContext } from '@/hooks/context/usePetContext';
import { usePetEvents } from '@/hooks/queries/petQueries';
import { useDevices } from '@/hooks/queries/deviceQueries';
import { useDateWindowNavigation } from '@/hooks/useDateWindowNavigation';
import {
  AppHeader,
  AppHeaderBar,
  AppHeaderRow,
} from '@/components/ui/AppHeader';
import PetSelector from '@/components/navigation/PetSelector';
import { PageAddAction, PageAddFab } from '@/components/ui/PageAddAction';
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
  const navigate = useNavigate();
  const { pets, selectedPet, isLoading: isPetsLoading } = usePetContext();
  const { data: devices, isLoading: isDevicesLoading } = useDevices();
  const petId = selectedPet?.id ?? 0;
  const showNoPetsEmpty = !isPetsLoading && pets.length === 0;
  const showNoDevicesEmpty =
    pets.length > 0 && !isDevicesLoading && devices?.length === 0;
  const showWidgetGrid =
    !showNoPetsEmpty && !showNoDevicesEmpty && (!!selectedPet || isPetsLoading);
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

  /*
   * Logging food is what this page is for, so it belongs in the header rather
   * than wedged into the Journal's own row, where it was elbowing the date
   * steppers. `PageAddFab` picks it up on a phone, where the header bar is the
   * pet strip and there is no actions slot to sit in.
   */
  const logFood = selectedPet ? () => setShowFoodModal(true) : undefined;

  return (
    <div className="page-overview">
      {/*
        On a phone the pet strip *is* the app bar: switching cat is the reason
        you come back to the top of this page, and a title row above it would
        only push it further from the thumb. Desktop keeps the title and leaves
        switching to the sidebar, where there is room for it.
      */}
      <AppHeader>
        <AppHeaderBar
          desktopOnly
          title={t('navigation.overview')}
          actions={
            logFood ? (
              <PageAddAction
                onClick={logFood}
                icon={Drumstick}
                label={t('overview.log_food')}
              />
            ) : null
          }
        />
        <AppHeaderRow>
          <PetSelector variant="mobile" />
        </AppHeaderRow>
      </AppHeader>

      <section className="widget-grid">
        {showNoPetsEmpty && (
          <div className="empty-state">
            <p>{t('overview.no_pets_found')}</p>
            <Button onClick={() => navigate('/settings/pets/new')}>
              {t('settings.add_pet')}
            </Button>
          </div>
        )}
        {showNoDevicesEmpty && (
          <div className="empty-state">
            <p>{t('overview.no_devices_found')}</p>
            <Button onClick={() => navigate('/settings/devices/new')}>
              {t('settings.add_device')}
            </Button>
          </div>
        )}
        {showWidgetGrid && (
          <WeightTrendCard petId={petId} isPending={isPetsLoading} />
        )}
        {showWidgetGrid && (
          <WaterConsumptionCard petId={petId} isPending={isPetsLoading} />
        )}
        {showWidgetGrid && (
          <FoodIntakeCard petId={petId} isPending={isPetsLoading} />
        )}
        {showWidgetGrid && (
          <LitterboxVisitsCard petId={petId} isPending={isPetsLoading} />
        )}
      </section>
      {!showNoPetsEmpty && (
        <section>
          <SectionHeader icon={<Clock />} actions={dateNavigation}>
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
      )}
      {logFood ? (
        <PageAddFab
          onClick={logFood}
          icon={Drumstick}
          label={t('overview.log_food')}
        />
      ) : null}
      {selectedEvent ? (
        <EventDetailsModal
          isOpen
          event={selectedEvent}
          onClose={handleCloseModal}
        />
      ) : null}
      {selectedPet && showFoodModal ? (
        <LogFoodModal
          isOpen
          onClose={() => setShowFoodModal(false)}
          petId={selectedPet.id}
          dateRange={dateRange}
        />
      ) : null}
    </div>
  );
};

export default Overview;
