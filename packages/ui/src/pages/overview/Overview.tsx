import React from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Toilet, Loader2 } from 'lucide-react';
import { addDays, subDays, format, parseISO } from 'date-fns';
import { usePetContext } from '@/hooks/context/usePetContext';
import { usePetEvents } from '@/hooks/queries/petQueries';
import { Card, CardHeader } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { DateNavigation } from '@/components/ui/DateNavigation';
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
    <DateNavigation
      date={dateRange.startDate}
      onPrev={handlePrevDay}
      onNext={handleNextDay}
      onReset={handleReset}
      isToday={isCurrentDay}
    />
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
          <Timeline>
            {isFetching && !isLoading && (
              <div className="overview-timeline-overlay">
                <Loader2 className="animate-spin" size={32} />
              </div>
            )}
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
