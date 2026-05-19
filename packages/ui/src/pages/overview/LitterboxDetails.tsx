import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, Toilet } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { GetEventDTO, LitterboxTrendsResponseDTO } from 'shared';
import { usePetContext } from '@/hooks/context/usePetContext';
import { usePetLitterboxTrends } from '@/hooks/queries/petQueries';
import { useDateWindowNavigation } from '@/hooks/useDateWindowNavigation';
import { DateNavigation } from '@/components/ui/DateNavigation';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Timeline from '@/components/ui/Timeline';
import { EventTimelineItem } from '@/components/events';
import EventDetailsModal from '@/components/events/EventDetailsModal';
import {
  LitterboxMetricChart,
  LitterboxTrendGrid,
  type LitterboxMetricChartSeries,
} from '@/components/litterbox';
import './LitterboxDetails.css';

type TrendEvent = LitterboxTrendsResponseDTO['days'][number]['events'][number];

const URINATION_COLOR = 'var(--color-litterbox-urination)';
const DEFECATION_COLOR = 'var(--color-litterbox-defecation)';
const COMBINED_COLOR = 'var(--color-litterbox-both)';

function chartPointsToSeries(
  points: Array<{
    timestamp: string;
    value: number;
    straining?: boolean;
  }>,
  id: string,
  label: string,
  color: string,
): LitterboxMetricChartSeries {
  return {
    id,
    label,
    color,
    points,
  };
}

function eventHasUrination(event: TrendEvent): boolean {
  return event.type === 'urination' || event.type === 'both';
}

function eventHasDefecation(event: TrendEvent): boolean {
  return event.type === 'defecation' || event.type === 'both';
}

function hoursBetweenEventsToSeries(
  events: TrendEvent[],
  predicate: (event: TrendEvent) => boolean,
  id: string,
  label: string,
  color: string,
): LitterboxMetricChartSeries {
  const sortedEvents = events
    .filter(predicate)
    .slice()
    .sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

  return {
    id,
    label,
    color,
    points: sortedEvents.slice(1).map((event, index) => {
      const previous = sortedEvents[index];
      const hours =
        (new Date(event.timestamp).getTime() -
          new Date(previous.timestamp).getTime()) /
        3_600_000;
      return {
        timestamp: event.timestamp,
        value: hours,
        straining: event.straining,
      };
    }),
  };
}

function eventToTimelineEvent(
  event: TrendEvent,
  petId: number,
): GetEventDTO | null {
  if (event.id === undefined) return null;
  return {
    id: event.id,
    parent_event_id: null,
    pet_id: petId,
    device_id: event.device_id ?? null,
    timestamp: event.timestamp,
    data: {
      type: 'litterbox_use',
      elimination_type: event.type,
      elimination_weight: event.elimination_weight ?? 0,
      duration: event.duration ?? 0,
      ...(event.straining ? { straining: true } : {}),
    },
    raw_data: null,
    human_verified: event.human_verified ?? false,
  };
}

const LitterboxDetails: React.FC = () => {
  const { t } = useTranslation();
  const { selectedPet } = usePetContext();
  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = React.useState<GetEventDTO | null>(
    null,
  );
  const {
    dateRange,
    startTime,
    endTime,
    isCurrentWindow,
    goToPreviousWindow,
    goToNextWindow,
    resetToCurrentWindow,
  } = useDateWindowNavigation({ days: 30 });

  const { data, isLoading, isFetching, error } = usePetLitterboxTrends(
    selectedPet?.id ?? 0,
    { startTime, endTime, detail: true },
    !!selectedPet,
  );

  React.useEffect(() => {
    setSelectedDate(null);
  }, [dateRange.startDate, dateRange.endDate]);

  if (!selectedPet) {
    return (
      <div className="page-litterbox-details">
        <Card>
          <CardContent empty>{t('common.no_pets_found')}</CardContent>
        </Card>
      </div>
    );
  }

  const analytics = data?.analytics;
  const allEvents = data?.days.flatMap((day) => day.events) ?? [];
  const selectedDay = data?.days.find((day) => day.date === selectedDate);
  const timelineEvents = (selectedDay?.events ?? allEvents)
    .slice()
    .reverse()
    .map((event) => eventToTimelineEvent(event, selectedPet.id))
    .filter((event): event is GetEventDTO => event !== null);

  const rangeActions = (
    <DateNavigation
      date={dateRange.startDate}
      endDate={dateRange.endDate}
      onPrev={goToPreviousWindow}
      onNext={goToNextWindow}
      onReset={resetToCurrentWindow}
      isToday={isCurrentWindow}
      dateFormat="MMM d"
    />
  );

  const urinationIntervalSeries = hoursBetweenEventsToSeries(
    allEvents,
    eventHasUrination,
    'hours-between-urination',
    t('overview.urination'),
    URINATION_COLOR,
  );
  const defecationIntervalSeries = hoursBetweenEventsToSeries(
    allEvents,
    eventHasDefecation,
    'hours-between-defecation',
    t('overview.defecation'),
    DEFECATION_COLOR,
  );

  return (
    <div className="page-litterbox-details">
      <SectionHeader icon={<Toilet />} actions={rangeActions}>
        {t('litterbox_details.title')}
      </SectionHeader>

      <Card isLoading={isFetching && !isLoading}>
        <CardHeader>
          <CardTitle>{t('litterbox_details.timeline')}</CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="litterbox-details-empty">
              {t('litterbox_details.error_loading')}
            </p>
          ) : (
            <div className="litterbox-details-dot-timeline">
              <LitterboxTrendGrid
                days={data?.days ?? []}
                onColumnClick={(column) => setSelectedDate(column.key)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <section className="litterbox-details-chart-grid">
        <Card>
          <CardContent>
            <LitterboxMetricChart
              title={t('litterbox_details.urination_frequency')}
              unit={t('litterbox_details.hours_between')}
              emptyLabel={t('litterbox_details.no_chart_data')}
              series={[urinationIntervalSeries]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <LitterboxMetricChart
              title={t('litterbox_details.defecation_frequency')}
              unit={t('litterbox_details.hours_between')}
              emptyLabel={t('litterbox_details.no_chart_data')}
              series={[defecationIntervalSeries]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <LitterboxMetricChart
              title={t('litterbox_details.urination_duration_chart')}
              unit={t('litterbox_details.seconds')}
              emptyLabel={t('litterbox_details.no_chart_data')}
              series={
                analytics
                  ? [
                      chartPointsToSeries(
                        analytics.urinationDurationPoints,
                        'urination-duration',
                        t('overview.urination'),
                        URINATION_COLOR,
                      ),
                    ]
                  : []
              }
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <LitterboxMetricChart
              title={t('litterbox_details.defecation_duration_chart')}
              unit={t('litterbox_details.seconds')}
              emptyLabel={t('litterbox_details.no_chart_data')}
              series={
                analytics
                  ? [
                      chartPointsToSeries(
                        analytics.defecationDurationPoints,
                        'defecation-duration',
                        t('overview.defecation'),
                        DEFECATION_COLOR,
                      ),
                    ]
                  : []
              }
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <LitterboxMetricChart
              title={t('litterbox_details.weight_chart')}
              unit={t('litterbox_details.grams')}
              emptyLabel={t('litterbox_details.no_chart_data')}
              series={
                analytics
                  ? [
                      chartPointsToSeries(
                        analytics.urinationWeightPoints,
                        'urination-weight',
                        t('overview.urination'),
                        URINATION_COLOR,
                      ),
                      chartPointsToSeries(
                        analytics.defecationWeightPoints,
                        'defecation-weight',
                        t('overview.defecation'),
                        DEFECATION_COLOR,
                      ),
                      chartPointsToSeries(
                        analytics.combinedEliminationWeightPoints,
                        'combined-weight',
                        t('overview.both'),
                        COMBINED_COLOR,
                      ),
                    ]
                  : []
              }
            />
          </CardContent>
        </Card>
      </section>

      <section>
        <SectionHeader icon={<Activity />}>
          {selectedDate
            ? `${t('litterbox_details.visits')} · ${format(parseISO(selectedDate), 'MMM d')}`
            : t('litterbox_details.recent_visits')}
        </SectionHeader>
        <Timeline isLoading={isFetching && !isLoading}>
          {timelineEvents.length === 0 ? (
            <li className="litterbox-details-empty">
              {t('litterbox_details.no_visits')}
            </li>
          ) : (
            timelineEvents.map((event) => (
              <EventTimelineItem
                key={event.id}
                event={event}
                showPet={false}
                showDevice={true}
                onClick={() => setSelectedEvent(event)}
              />
            ))
          )}
        </Timeline>
      </section>

      <EventDetailsModal
        isOpen={selectedEvent !== null}
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />
    </div>
  );
};

export default LitterboxDetails;
