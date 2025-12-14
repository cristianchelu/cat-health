import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Clock,
  Toilet,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Loader2,
} from 'lucide-react';
import { addDays, subDays, format, parseISO } from 'date-fns';
import { usePetContext } from '@/hooks/context/usePetContext';
import { usePetEvents } from '@/hooks/queries/petQueries';
import { Card, CardHeader } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Button } from '@/components/ui/Button';
import Timeline from '@/components/ui/Timeline';
import { EventTimelineItem } from '@/components/events';
import type { DateRange } from '@/lib/utils';

import WeightTrendCard from '@/pages/overview/components/WeightTrendCard';
import WaterConsumptionCard from '@/pages/overview/components/WaterConsumptionCard';
import FoodIntakeCard from '@/pages/overview/components/FoodIntakeCard';

import './Overview.css';

const Overview: React.FC = () => {
  const { t } = useTranslation();
  const { selectedPet } = usePetContext();

  const getTodayString = () => new Date().toISOString().split('T')[0];

  const [dateRange, setDateRange] = React.useState<DateRange>(() => {
    const dateStr = getTodayString();
    return {
      startDate: dateStr,
      endDate: dateStr,
      type: 'day',
    };
  });

  const handlePrevDay = () => {
    const current = parseISO(dateRange.startDate);
    const prev = subDays(current, 1);
    const dateStr = format(prev, 'yyyy-MM-dd');
    setDateRange({
      startDate: dateStr,
      endDate: dateStr,
      type: 'day',
    });
  };

  const handleNextDay = () => {
    const current = parseISO(dateRange.startDate);
    const next = addDays(current, 1);
    const dateStr = format(next, 'yyyy-MM-dd');
    setDateRange({
      startDate: dateStr,
      endDate: dateStr,
      type: 'day',
    });
  };

  const handleReset = () => {
    const dateStr = getTodayString();
    setDateRange({
      startDate: dateStr,
      endDate: dateStr,
      type: 'day',
    });
  };

  const {
    data: eventsData,
    isLoading,
    isFetching,
  } = usePetEvents(selectedPet?.id ?? 0, dateRange, !!selectedPet);

  const isCurrentDay = dateRange.startDate === getTodayString();

  const dateNavigation = (
    <div className="overview-date-nav">
      <Button variant="ghost" size="sm" icon onClick={handlePrevDay}>
        <ChevronLeft size={20} />
      </Button>
      <span className="overview-date-display">
        {format(parseISO(dateRange.startDate), 'MMM d')}
      </span>
      <Button
        variant="ghost"
        size="sm"
        icon
        onClick={handleNextDay}
        disabled={isCurrentDay}
      >
        <ChevronRight size={20} />
      </Button>
      {!isCurrentDay && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleReset}
          icon
          className="overview-today-btn"
        >
          <RotateCcw size={16} />
        </Button>
      )}
    </div>
  );

  return (
    <div className="page-overview">
      <section className="widget-grid">
        {selectedPet && <WeightTrendCard petId={selectedPet.id} />}
        {selectedPet && <WaterConsumptionCard petId={selectedPet.id} />}
        {selectedPet && <FoodIntakeCard petId={selectedPet.id} />}
        <Card>
          <CardHeader>
            <Toilet style={{ marginRight: 'auto' }} />
            <span>3 {t('overview.times')}</span>
          </CardHeader>
        </Card>
      </section>
      <section>
        <SectionHeader icon={<Clock />} actions={dateNavigation}>
          {t('overview.activity')}
        </SectionHeader>
        <div className="overview-timeline-container">
          {isFetching && !isLoading && (
            <div className="overview-timeline-overlay">
              <Loader2 className="animate-spin" size={32} />
            </div>
          )}
          <Timeline>
            {isLoading && (
              <li className="overview-loading-activity">Loading...</li>
            )}
            {!isLoading && eventsData?.data.length === 0 && (
              <li className="overview-empty-activity">
                {t('overview.no_activity')}
              </li>
            )}
            {eventsData?.data
              .filter((ev) => ev.data.type !== 'weight_measurement')
              .map((event) => (
                <EventTimelineItem key={event.id} event={event} />
              ))}
          </Timeline>
        </div>
      </section>
    </div>
  );
};

export default Overview;
