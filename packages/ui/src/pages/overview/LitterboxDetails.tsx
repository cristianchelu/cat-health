import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router';
import type { LitterboxTrendsResponseDTO } from 'shared';
import { usePetContext } from '@/hooks/context/usePetContext';
import { usePetLitterboxTrends } from '@/hooks/queries/petQueries';
import { useDateWindowNavigation } from '@/hooks/useDateWindowNavigation';
import { DateNavigation } from '@/components/ui/DateNavigation';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import {
  LitterboxMetricChart,
  LitterboxTrendGrid,
  type LitterboxMetricChartSeries,
} from '@/components/litterbox';
import './LitterboxDetails.css';

type TrendEvent = LitterboxTrendsResponseDTO['days'][number]['events'][number];

const URINATION_COLOR = 'var(--color-litterbox-urination)';
const DEFECATION_COLOR = 'var(--color-litterbox-defecation)';

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

const LitterboxDetails: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { selectedPet } = usePetContext();
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
      <header className="litterbox-details-header">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon
          onClick={() => navigate(-1)}
          aria-label={t('litterbox_details.back')}
          title={t('litterbox_details.back')}
        >
          <ArrowLeft size={18} />
        </Button>
        {rangeActions}
      </header>

      <section className="litterbox-details-chart-grid">
        <section className="litterbox-details-chart-section litterbox-details-chart-section--wide">
          <SectionHeader>{t('litterbox_details.timeline')}</SectionHeader>
          <Card className="litterbox-details-chart-card" isLoading={isFetching && !isLoading}>
            <CardContent>
              {error ? (
                <p className="litterbox-details-empty">
                  {t('litterbox_details.error_loading')}
                </p>
              ) : (
                <div className="litterbox-details-dot-timeline">
                  <LitterboxTrendGrid days={data?.days ?? []} />
                </div>
              )}
            </CardContent>
          </Card>
        </section>
        <section className="litterbox-details-chart-section">
          <SectionHeader>{t('litterbox_details.urination_frequency')}</SectionHeader>
          <Card className="litterbox-details-chart-card">
            <CardContent>
              <LitterboxMetricChart
                title={t('litterbox_details.urination_frequency')}
                unit={t('litterbox_details.hours_between')}
                emptyLabel={t('litterbox_details.no_chart_data')}
                series={[urinationIntervalSeries]}
              />
            </CardContent>
          </Card>
        </section>
        <section className="litterbox-details-chart-section">
          <SectionHeader>{t('litterbox_details.defecation_frequency')}</SectionHeader>
          <Card className="litterbox-details-chart-card">
            <CardContent>
              <LitterboxMetricChart
                title={t('litterbox_details.defecation_frequency')}
                unit={t('litterbox_details.hours_between')}
                emptyLabel={t('litterbox_details.no_chart_data')}
                series={[defecationIntervalSeries]}
              />
            </CardContent>
          </Card>
        </section>
        <section className="litterbox-details-chart-section">
          <SectionHeader>{t('litterbox_details.urination_duration_chart')}</SectionHeader>
          <Card className="litterbox-details-chart-card">
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
        </section>
        <section className="litterbox-details-chart-section">
          <SectionHeader>{t('litterbox_details.defecation_duration_chart')}</SectionHeader>
          <Card className="litterbox-details-chart-card">
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
        </section>
      </section>
    </div>
  );
};

export default LitterboxDetails;
