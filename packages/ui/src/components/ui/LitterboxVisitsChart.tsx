import * as React from 'react';

import { cn, type DateRange } from '@/lib/utils';
import { usePetEvents } from '@/hooks/queries/petQueries';

import { Card, CardContent, CardHeader } from './Card';
import { Select } from './form';

import './LitterboxVisitsChart.css';

type TimePeriod = 'week' | 'month' | 'quarter' | 'all';

interface LitterboxVisitsChartProps extends React.ComponentProps<'div'> {
  petId: number;
}

interface DayEvents {
  date: string;
  events: Array<{
    id: number;
    timestamp: string;
    eliminationType:
      | 'urination'
      | 'defecation'
      | 'both'
      | 'no_elimination'
      | 'unknown';
  }>;
}

// Get elimination type color
// Returns a string for the CSS background property (color or gradient)
function getEliminationColor(type: string): string {
  switch (type) {
    case 'urination':
      return '#FFD700'; // Gold for urination (matches LitterboxUseEvent)
    case 'defecation':
      return '#8B4513'; // Brown for defecation (matches LitterboxUseEvent)
    case 'both':
      // Diagonal split: gold (urination) and brown (defecation)
      return 'linear-gradient(135deg, #FFD700 50%, #8B4513 50%)';
    case 'no_elimination':
      return '#808080'; // Gray for no elimination (matches LitterboxUseEvent)
    case 'unknown':
    default:
      return '#e5e7eb'; // Very muted light gray for unknown (almost background color)
  }
}

// Get the last N days of dates
function getLastNDays(days: number): string[] {
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    dates.push(date.toISOString().split('T')[0]);
  }
  return dates;
}

// Calculate days based on selected period
function getDaysForPeriod(period: TimePeriod): number {
  switch (period) {
    case 'week':
      return 7;
    case 'month':
      return 30;
    case 'quarter':
      return 90;
    case 'all':
      return 365; // Limit to 1 year for performance
    default:
      return 30;
  }
}

const periodLabels: Record<TimePeriod, string> = {
  week: 'Week',
  month: 'Month',
  quarter: 'Quarter',
  all: 'All',
};

const LitterboxVisitsChart = React.forwardRef<
  HTMLDivElement,
  LitterboxVisitsChartProps
>(({ petId, className, ...props }, ref) => {
  const [selectedPeriod, setSelectedPeriod] =
    React.useState<TimePeriod>('week');

  const daysToShow = getDaysForPeriod(selectedPeriod);

  // Get date range for the last N days (for display)
  const dates = getLastNDays(daysToShow);

  // Calculate API fetch range - start from N days ago until now
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysToShow); // Remove the +1
  const endDate = new Date();

  const apiStartTime = startDate.toISOString().split('T')[0];
  const apiEndTime = endDate.toISOString().split('T')[0];

  const dateRange: DateRange = {
    startDate: apiStartTime,
    endDate: apiEndTime,
    type: 'custom',
  };

  // Fetch events for the date range
  const {
    data: eventsData,
    isLoading,
    error,
  } = usePetEvents(petId, dateRange, true);

  if (isLoading) {
    return (
      <Card
        className={cn('litterbox-visits-chart', className)}
        ref={ref}
        {...props}
      >
        <CardHeader>
          <h3>Litterbox Visits</h3>
          <Select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value as TimePeriod)}
            options={(Object.keys(periodLabels) as TimePeriod[]).map(
              (period) => ({
                value: period,
                label: periodLabels[period],
              }),
            )}
          />
        </CardHeader>
        <div className="chart-loading">Loading visits chart...</div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card
        className={cn('litterbox-visits-chart', className)}
        ref={ref}
        {...props}
      >
        <CardHeader>
          <h3>Litterbox Visits</h3>
          <Select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value as TimePeriod)}
            options={(Object.keys(periodLabels) as TimePeriod[]).map(
              (period) => ({
                value: period,
                label: periodLabels[period],
              }),
            )}
          />
        </CardHeader>
        <div className="chart-error">Error loading visits chart</div>
      </Card>
    );
  }

  // Group events by day and filter only litterbox events
  const eventsByDay: { [date: string]: DayEvents } = {};
  dates.forEach((date) => {
    eventsByDay[date] = { date, events: [] };
  });

  if (eventsData?.data) {
    eventsData.data.forEach((event) => {
      const eventDate = event.timestamp.split('T')[0];
      if (
        eventsByDay[eventDate] &&
        event.data &&
        typeof event.data === 'object' &&
        'type' in event.data &&
        event.data.type === 'litterbox_use'
      ) {
        const litterboxData = event.data as {
          type: 'litterbox_use';
          elimination_type:
            | 'urination'
            | 'defecation'
            | 'both'
            | 'no_elimination'
            | 'unknown';
        };

        eventsByDay[eventDate].events.push({
          id: event.id,
          timestamp: event.timestamp,
          eliminationType: litterboxData.elimination_type,
        });
      }
    });
  }

  // Sort events within each day by timestamp (earliest first, so they stack from bottom)
  Object.values(eventsByDay).forEach((day) => {
    day.events.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  });

  // Check if there are any events to display
  const totalEvents = Object.values(eventsByDay).reduce(
    (sum, day) => sum + day.events.length,
    0,
  );

  return (
    <Card
      className={cn('litterbox-visits-chart', className)}
      ref={ref}
      {...props}
    >
      <CardHeader>
        <h3>Litterbox Visits</h3>
        <Select
          value={selectedPeriod}
          onChange={(e) => setSelectedPeriod(e.target.value as TimePeriod)}
          options={(Object.keys(periodLabels) as TimePeriod[]).map(
            (period) => ({
              value: period,
              label: periodLabels[period],
            }),
          )}
        />
      </CardHeader>
      <div className="chart-legend">
        <div className="legend-item">
          <div
            className="legend-dot"
            style={{ background: getEliminationColor('urination') }}
          ></div>
          <span>Urination</span>
        </div>
        <div className="legend-item">
          <div
            className="legend-dot"
            style={{ background: getEliminationColor('defecation') }}
          ></div>
          <span>Defecation</span>
        </div>
        <div className="legend-item">
          <div
            className="legend-dot"
            style={{ background: getEliminationColor('both') }}
          ></div>
          <span>Both</span>
        </div>
        <div className="legend-item">
          <div
            className="legend-dot"
            style={{ background: getEliminationColor('no_elimination') }}
          ></div>
          <span>No elimination</span>
        </div>
        <div className="legend-item">
          <div
            className="legend-dot"
            style={{ background: getEliminationColor('unknown') }}
          ></div>
          <span>Unknown</span>
        </div>
      </div>

      {totalEvents === 0 ? (
        <CardContent className="chart-empty">
          No litterbox visits recorded in the{' '}
          {periodLabels[selectedPeriod].toLowerCase()}.
        </CardContent>
      ) : (
        <CardContent className="chart-content">
          <div className="chart-grid">
            {dates.map((date) => {
              const dayData = eventsByDay[date];
              const dayLabel = new Date(date + 'T12:00:00').toLocaleDateString(
                'en-US',
                {
                  month: 'short',
                  day: 'numeric',
                },
              );
              const visitCount = dayData.events.length;

              return (
                <div key={date} className="day-column">
                  <div className="day-label">
                    <div className="day-date">{dayLabel}</div>
                    <div
                      className={`visit-count ${visitCount === 0 ? 'zero-visits' : ''}`}
                    >
                      {visitCount}
                    </div>
                  </div>
                  <div
                    className="events-column"
                    title={
                      visitCount > 0
                        ? `${visitCount} visit${visitCount > 1 ? 's' : ''} on ${dayLabel}`
                        : `No visits on ${dayLabel}`
                    }
                  >
                    {dayData.events.map((event) => (
                      <div
                        key={`${date}-${event.id}`}
                        className="event-slot has-event"
                      >
                        <div
                          className="event-dot"
                          style={{
                            background: getEliminationColor(
                              event.eliminationType,
                            ),
                          }}
                          title={`${event.eliminationType} at ${new Date(event.timestamp).toLocaleTimeString()}`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      )}
    </Card>
  );
});

LitterboxVisitsChart.displayName = 'LitterboxVisitsChart';

export { type LitterboxVisitsChartProps };
export default LitterboxVisitsChart;
