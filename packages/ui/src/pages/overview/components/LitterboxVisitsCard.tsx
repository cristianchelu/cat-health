import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Toilet, Loader, Droplets } from 'lucide-react';
import PoopIcon from '@/components/icons/PoopIcon';
import { usePetLitterboxTrends } from '@/hooks/queries/petQueries';
import { differenceInMinutes, differenceInHours, differenceInDays } from 'date-fns';
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

interface DayData {
  dots: DotType[];
  hasOverflow: boolean;
  overflowCount: number;
}

function processApiData(
  apiDays: Array<{ date: string; events: Array<{ type: string; timestamp: string }> }>,
): DayData[] {
  return apiDays.map((day) => {
    // Expand "both" events into separate dots
    const dots: DotType[] = [];
    for (const event of day.events) {
      const type = event.type as LitterboxUseEliminationType;
      if (type === 'both') {
        dots.push('urination', 'defecation');
      } else {
        dots.push(type as DotType);
      }
    }

    // Sort by priority (lower priority first, so higher priority ends up at top)
    dots.sort((a, b) => DOT_PRIORITY[a] - DOT_PRIORITY[b]);

    let hasOverflow = false;
    let overflowCount = 0;

    if (dots.length > MAX_DOTS_PER_DAY) {
      hasOverflow = true;
      overflowCount = dots.length - MAX_DOTS_PER_DAY;
      // Keep the first N dots (actual eliminations), drop the top ones (no_elimination)
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

  if (isLoading) {
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
        <CardContent>
          <div className="litterbox-loading">
            <Loader className="animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
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
        <CardContent empty>
          <p>{t('overview.error_loading')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="litterbox-visits-card">
      <CardHeader>
        <Toilet style={{ marginRight: 'auto' }} />
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
      </CardHeader>
      <CardContent>
        <div className="litterbox-dot-chart">
          {dayData.map((day, dayIndex) => (
            <div key={dayIndex} className="dot-column">
              {day.dots.map((dotType, dotIndex) => {
                const isTopDot = dotIndex === day.dots.length - 1;
                const showOverflow = isTopDot && day.hasOverflow;

                return (
                  <div
                    key={dotIndex}
                    className="dot-wrapper"
                  >
                    <div
                      className="dot"
                      style={{ backgroundColor: DOT_COLORS[dotType] }}
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
      </CardContent>
    </Card>
  );
};

export default LitterboxVisitsCard;
