import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Toilet, Droplets } from 'lucide-react';
import PoopIcon from '@/components/icons/PoopIcon';
import { usePetLitterboxTrends } from '@/hooks/queries/petQueries';
import {
  differenceInMinutes,
  differenceInHours,
  differenceInDays,
} from 'date-fns';
import type { LitterboxUseEliminationType } from 'shared';
import './LitterboxVisitsCard.css';

interface LitterboxVisitsCardProps {
  petId: number;
}

// Dot types for rendering (after expanding "both" into separate dots)
type DotType = 'urination' | 'defecation' | 'no_elimination' | 'unknown';

// Priority order: higher number = higher priority (shown at top)
const DOT_PRIORITY: Record<DotType, number> = {
  unknown: 0,
  defecation: 1,
  urination: 2,
  no_elimination: 3,
};

const DOT_COLORS: Record<DotType, string> = {
  urination: '#FFA500',
  defecation: '#8B4513',
  no_elimination: 'var(--color-text-muted)',
  unknown: 'var(--color-border)',
};

const MAX_DOTS_PER_DAY = 4;

function formatShortDuration(date: Date): string {
  const now = new Date();
  const days = differenceInDays(now, date);
  if (days >= 1) return `${days}d`;

  const hours = differenceInHours(now, date);
  if (hours >= 1) return `${hours}h`;

  const minutes = differenceInMinutes(now, date);
  return `${minutes}m`;
}

interface DotData {
  type: DotType;
  straining?: boolean;
}

interface DayData {
  dots: DotData[];
  hasOverflow: boolean;
  overflowCount: number;
}

function processApiData(
  apiDays: Array<{
    date: string;
    events: Array<{
      type: string;
      timestamp: string;
      straining?: boolean;
    }>;
  }>,
): DayData[] {
  return apiDays.map((day) => {
    const dots: DotData[] = [];
    for (const event of day.events) {
      const type = event.type as LitterboxUseEliminationType;
      if (type === 'both') {
        dots.push(
          { type: 'urination', straining: event.straining },
          { type: 'defecation', straining: event.straining },
        );
      } else {
        dots.push({ type: type as DotType, straining: event.straining });
      }
    }

    dots.sort((a, b) => DOT_PRIORITY[a.type] - DOT_PRIORITY[b.type]);

    let hasOverflow = false;
    let overflowCount = 0;

    if (dots.length > MAX_DOTS_PER_DAY) {
      hasOverflow = true;
      overflowCount = dots.length - MAX_DOTS_PER_DAY;
      dots.splice(MAX_DOTS_PER_DAY);
    }

    return { dots, hasOverflow, overflowCount };
  });
}

const LitterboxVisitsCard: React.FC<LitterboxVisitsCardProps> = ({ petId }) => {
  const { t } = useTranslation();

  const { data, isLoading, error } = usePetLitterboxTrends(petId, 7);

  const dayData = React.useMemo(() => {
    if (!data?.days) return [];
    return processApiData(data.days);
  }, [data]);

  const timeSinceLastPee = data?.lastPee
    ? formatShortDuration(new Date(data.lastPee))
    : null;

  const timeSinceLastPoop = data?.lastPoop
    ? formatShortDuration(new Date(data.lastPoop))
    : null;

  if (error && !isLoading) {
    return (
      <Card className="litterbox-visits-card">
        <CardHeader>
          <Toilet style={{ marginRight: 'auto' }} />
          <div className="litterbox-stats">
            <span className="litterbox-stat">
              <Droplets size={18} color="#FFA500" />
              --
            </span>
            <span className="litterbox-stat">
              <PoopIcon size={18} color="#8B4513" />
              --
            </span>
          </div>
        </CardHeader>
        <CardContent empty className="overview-litterbox-chart-slot">
          <p>{t('overview.error_loading')}</p>
        </CardContent>
      </Card>
    );
  }

  const statsHeader = isLoading ? (
    <div className="litterbox-stats">
      <span className="litterbox-stat">
        <Droplets size={18} color="#FFA500" />
        --
      </span>
      <span className="litterbox-stat">
        <PoopIcon size={18} color="#8B4513" />
        --
      </span>
    </div>
  ) : (
    <div className="litterbox-stats">
      <span className="litterbox-stat">
        <Droplets size={18} color="#FFA500" />
        {timeSinceLastPee ?? '--'}
      </span>
      <span className="litterbox-stat">
        <PoopIcon size={18} color="#8B4513" />
        {timeSinceLastPoop ?? '--'}
      </span>
    </div>
  );

  const chartBody = isLoading ? (
    <div className="litterbox-dot-chart litterbox-dot-chart--pending" aria-hidden />
  ) : (
    <div className="litterbox-dot-chart">
      {dayData.map((day, dayIndex) => (
        <div key={dayIndex} className="dot-column">
          {day.dots.map((dot, dotIndex) => {
            const isTopDot = dotIndex === day.dots.length - 1;
            const showOverflow = isTopDot && day.hasOverflow;

            return (
              <div key={dotIndex} className="dot-wrapper">
                <div
                  className={`dot${dot.straining ? ' dot-straining' : ''}`}
                  style={{ backgroundColor: DOT_COLORS[dot.type] }}
                />
                {showOverflow && (
                  <span className="overflow-badge">+{day.overflowCount}</span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );

  return (
    <Card className="litterbox-visits-card" isLoading={isLoading}>
      <CardHeader>
        <Toilet style={{ marginRight: 'auto' }} />
        {statsHeader}
      </CardHeader>
      <CardContent className="overview-litterbox-chart-slot">
        {chartBody}
      </CardContent>
    </Card>
  );
};

export default LitterboxVisitsCard;
