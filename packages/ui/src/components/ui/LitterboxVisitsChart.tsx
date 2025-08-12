import * as React from "react";
import { useQuery } from '@tanstack/react-query';
import { getPetEvents } from '@/api/pets';
import { cn } from "@/lib/utils";
import './litterbox-visits-chart.css';
import '@/components/ui/button.css';

type TimePeriod = 'week' | 'month' | 'quarter' | 'all';

interface LitterboxVisitsChartProps extends React.ComponentProps<"div"> {
  petId: number;
}

interface DayEvents {
  date: string;
  events: Array<{
    id: number;
    timestamp: string;
    eliminationType: 'urination' | 'defecation' | 'no_elimination' | 'unknown';
  }>;
}

// Get elimination type color
function getEliminationColor(type: string): string {
  switch (type) {
    case 'urination':
      return '#FFD700'; // Gold for urination (matches LitterboxUseEvent)
    case 'defecation':
      return '#8B4513'; // Brown for defecation (matches LitterboxUseEvent)
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
    case 'week': return 7;
    case 'month': return 30;
    case 'quarter': return 90;
    case 'all': return 365; // Limit to 1 year for performance
    default: return 30;
  }
}

const periodLabels: Record<TimePeriod, string> = {
  week: 'This Week',
  month: 'This Month',
  quarter: 'Last 3 Months',
  all: 'This Year'
};

const LitterboxVisitsChart = React.forwardRef<HTMLDivElement, LitterboxVisitsChartProps>(
  ({ petId, className, ...props }, ref) => {
    const [selectedPeriod, setSelectedPeriod] = React.useState<TimePeriod>('month');

    const daysToShow = getDaysForPeriod(selectedPeriod);

    // Get date range for the last N days
    const dates = getLastNDays(daysToShow);
    const startDate = dates[0];
    const endDate = dates[dates.length - 1];

    // Fetch events for the date range
    const { data: eventsData, isLoading, error } = useQuery({
      queryKey: ['petEventsRange', petId, selectedPeriod, daysToShow],
      queryFn: async () => {
        const startTime = startDate + 'T00:00:00.000Z';
        const endTime = endDate + 'T23:59:59.999Z';
        return getPetEvents(petId, startTime, endTime);
      },
      enabled: !!petId,
    });

    if (isLoading) {
      return (
        <div
          className={cn("litterbox-visits-chart", className)}
          ref={ref}
          {...props}
        >
          <div className="chart-header">
            <div>
              <h3 className="chart-title">Litterbox Visits - {periodLabels[selectedPeriod]}</h3>
            </div>
            <div className="chart-actions">
              {(Object.keys(periodLabels) as TimePeriod[]).map((period) => (
                <button
                  key={period}
                  onClick={() => setSelectedPeriod(period)}
                  className={`button button-sm ${selectedPeriod === period ? 'button-primary' : 'button-outline'}`}
                >
                  {periodLabels[period]}
                </button>
              ))}
            </div>
          </div>
          <div className="chart-loading">Loading visits chart...</div>
        </div>
      );
    }

    if (error) {
      return (
        <div
          className={cn("litterbox-visits-chart", className)}
          ref={ref}
          {...props}
        >
          <div className="chart-header">
            <div>
              <h3 className="chart-title">Litterbox Visits - {periodLabels[selectedPeriod]}</h3>
            </div>
            <div className="chart-actions">
              {(Object.keys(periodLabels) as TimePeriod[]).map((period) => (
                <button
                  key={period}
                  onClick={() => setSelectedPeriod(period)}
                  className={`button button-sm ${selectedPeriod === period ? 'button-primary' : 'button-outline'}`}
                >
                  {periodLabels[period]}
                </button>
              ))}
            </div>
          </div>
          <div className="chart-error">Error loading visits chart</div>
        </div>
      );
    }

    // Group events by day and filter only litterbox events
    const eventsByDay: { [date: string]: DayEvents } = {};
    dates.forEach(date => {
      eventsByDay[date] = { date, events: [] };
    });

    if (eventsData?.events) {
      eventsData.events.forEach(event => {
        const eventDate = event.timestamp.split('T')[0];
        if (eventsByDay[eventDate] && 
            event.data && 
            typeof event.data === 'object' && 
            'type' in event.data && 
            event.data.type === 'litterbox_use') {
          
          const litterboxData = event.data as {
            type: 'litterbox_use';
            elimination_type: 'urination' | 'defecation' | 'no_elimination' | 'unknown';
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
    Object.values(eventsByDay).forEach(day => {
      day.events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    });

    // Check if there are any events to display
    const totalEvents = Object.values(eventsByDay).reduce((sum, day) => sum + day.events.length, 0);

    return (
      <div
        className={cn("litterbox-visits-chart", className)}
        ref={ref}
        {...props}
      >
        <div className="chart-header">
          <div>
            <h3 className="chart-title">Litterbox Visits - {periodLabels[selectedPeriod]}</h3>
          </div>
          <div className="chart-actions">
            {(Object.keys(periodLabels) as TimePeriod[]).map((period) => (
              <button
                key={period}
                onClick={() => setSelectedPeriod(period)}
                className={`button button-sm ${selectedPeriod === period ? 'button-primary' : 'button-outline'}`}
              >
                {periodLabels[period]}
              </button>
            ))}
          </div>
        </div>
        <div className="chart-legend">
          <div className="legend-item">
            <div className="legend-dot" style={{ backgroundColor: getEliminationColor('urination') }}></div>
            <span>Urination</span>
          </div>
          <div className="legend-item">
            <div className="legend-dot" style={{ backgroundColor: getEliminationColor('defecation') }}></div>
            <span>Defecation</span>
          </div>
          <div className="legend-item">
            <div className="legend-dot" style={{ backgroundColor: getEliminationColor('no_elimination') }}></div>
            <span>No elimination</span>
          </div>
          <div className="legend-item">
            <div className="legend-dot" style={{ backgroundColor: getEliminationColor('unknown') }}></div>
            <span>Unknown</span>
          </div>
        </div>
        
        {totalEvents === 0 ? (
          <div className="chart-empty">No litterbox visits recorded in the {periodLabels[selectedPeriod].toLowerCase()}.</div>
        ) : (
          <div className="chart-container">
          <div className="chart-grid">
            {dates.map(date => {
              const dayData = eventsByDay[date];
              const dayLabel = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric' 
              });
              const visitCount = dayData.events.length;
              
              return (
                <div key={date} className="day-column">
                  <div className="day-label">
                    <div className="day-date">{dayLabel}</div>
                    <div className={`visit-count ${visitCount === 0 ? 'zero-visits' : ''}`}>
                      {visitCount}
                    </div>
                  </div>
                  <div 
                    className="events-column"
                    title={visitCount > 0 ? 
                      `${visitCount} visit${visitCount > 1 ? 's' : ''} on ${dayLabel}` : 
                      `No visits on ${dayLabel}`
                    }
                  >
                    {dayData.events.map((event) => (
                      <div
                        key={`${date}-${event.id}`}
                        className="event-slot has-event"
                      >
                        <div
                          className="event-dot"
                          style={{ backgroundColor: getEliminationColor(event.eliminationType) }}
                          title={`${event.eliminationType} at ${new Date(event.timestamp).toLocaleTimeString()}`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        )}
      </div>
    );
  }
);

LitterboxVisitsChart.displayName = "LitterboxVisitsChart";

export { type LitterboxVisitsChartProps };
export default LitterboxVisitsChart;
